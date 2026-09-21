import { IDBFactory } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  drain,
  enqueue,
  indexedDbStore,
  intentId,
  memoryStore,
  openQueue,
  type Applied,
  type Intent,
  type QueueStore,
} from '../src/index.js';

/**
 * The queue's rules, held against **both** stores.
 *
 * The in-memory one is not a stand-in for the real thing — it is the same contract, and every rule
 * below runs against it and against IndexedDB (via `fake-indexeddb`, a real implementation of the
 * API rather than a mock of it). A rule that only holds in memory is a rule the browser does not
 * have.
 */

const anIntent = (round: number, id = randomUUID()): Intent => ({
  kind: 'match_played',
  id: intentId(id),
  at: round,
  careerId: 'career',
  seasonOrdinal: 1,
  round,
  choices: {
    yourSlug: 'a',
    opponentSlug: 'b',
    venue: 'home',
    approach: 'balanced',
    line: 'normal',
    press: 'moderate',
    call: null,
  },
  engineVersion: '0.0.0',
  predicted: { seed: `seed-${round}`, homeScore: 1, awayScore: 0 },
});

const stores: ReadonlyArray<readonly [string, () => Promise<QueueStore>]> = [
  ['memory', async () => memoryStore()],
  [
    'indexeddb',
    async () => indexedDbStore(await openQueue(new IDBFactory(), `queue-${randomUUID()}`)),
  ],
];

describe.each(stores)('a %s queue', (_name, make) => {
  it('keeps what was queued, oldest first', async () => {
    const store = await make();
    for (const round of [1, 2, 3]) await enqueue(store, anIntent(round));
    const pending = await store.pending();
    expect(pending.map((intent) => (intent.kind === 'match_played' ? intent.round : 0))).toEqual([
      1, 2, 3,
    ]);
  });

  it('is idempotent by id, so a crash and a re-queue cost nothing', async () => {
    const store = await make();
    const intent = anIntent(1);
    await enqueue(store, intent);
    await enqueue(store, intent);
    expect(await store.pending()).toHaveLength(1);
  });

  it('forgets only what the server confirmed', async () => {
    const store = await make();
    const kept = anIntent(1);
    const taken = anIntent(2);
    await enqueue(store, kept);
    await enqueue(store, taken);

    await store.forget([taken.id]);
    const left = await store.pending();
    expect(left).toHaveLength(1);
    expect(left[0]?.id).toBe(kept.id);
  });

  it('holds everything when the transport throws', async () => {
    // A dropped connection must cost nothing. Anything else and a player loses an evening.
    const store = await make();
    await enqueue(store, anIntent(1));
    const report = await drain(store, async () => {
      throw new Error('offline');
    });
    expect(report.applied).toEqual([]);
    expect(report.stillPending).toBe(1);
    expect(await store.pending()).toHaveLength(1);
  });

  it('keeps a rejected intent and clears an accepted one, from the same batch', async () => {
    // The distinction the queue exists for. Dropping a rejection would lose the match; keeping an
    // acceptance would replay it.
    const store = await make();
    const good = anIntent(1);
    const bad = anIntent(2);
    await enqueue(store, good);
    await enqueue(store, bad);

    const report = await drain(store, async (intents): Promise<readonly Applied[]> =>
      intents.map((intent) =>
        intent.id === bad.id
          ? { id: intent.id, outcome: 'rejected', reason: 'no' }
          : { id: intent.id, outcome: 'applied' },
      ),
    );
    expect(report.applied).toEqual([good.id]);
    expect(report.rejected).toHaveLength(1);
    const left = await store.pending();
    expect(left.map((intent) => intent.id)).toEqual([bad.id]);
  });

  it('clears a divergence, because re-sending will not change the server’s mind', async () => {
    // A divergence needs a person, not a retry. Leaving it queued would re-send it for ever.
    const store = await make();
    const intent = anIntent(1);
    await enqueue(store, intent);
    const report = await drain(store, async () => [
      { id: intent.id, outcome: 'diverged', predicted: '9-0@x', derived: '1-0@x' } as Applied,
    ]);
    expect(report.diverged).toHaveLength(1);
    expect(await store.pending()).toHaveLength(0);
  });

  it('does nothing at all when there is nothing queued', async () => {
    const store = await make();
    let called = false;
    const report = await drain(store, async () => {
      called = true;
      return [];
    });
    expect(called, 'an empty queue still called the network').toBe(false);
    expect(report.sent).toBe(0);
  });
});
