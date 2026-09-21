import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { ENGINE_VERSION, simulate } from '@dakka/engine';
import { buildFixture, type Setup } from '@dakka/fixture';
import {
  drain,
  enqueue,
  intentId,
  memoryStore,
  type Intent,
  type MatchPlayed,
  type Transport,
} from '@dakka/sync';
import {
  SUPABASE_AUTH_SHIM,
  applyIntents,
  loadMigrations,
  migrate,
  seedLeague,
  type SqlClient,
} from '../src/index.js';

/**
 * Plays offline, reconnects, and the two sides agree.
 *
 * The box names the failure: *faking it looks like last-write-wins.* Nothing below picks a winner,
 * because there is nothing to pick between — the client queues the **choices** it made, and the
 * server replays them through the same deterministic engine and keeps its own result. The client's
 * score travels as a claim to be checked, never as data to be stored.
 *
 * Four things are held here: the server ends up with what the client saw; a retry after a lost
 * acknowledgement plays nothing twice; a disagreement is reported as a divergence with the
 * server's answer standing; and an intent the server would not take stays queued rather than being
 * dropped on the floor.
 */

const db = new PGlite();
const client = db as unknown as SqlClient;
const content = loadLeague(DATA_ROOT, 'egy-d4');
const league = { league: content.league, clubs: content.clubs, data: content.data };

let deps: { client: SqlClient; league: typeof league; careerId: string; seasonId: string };

const choicesFor = (round: number): Setup => ({
  yourSlug: content.data[0]?.slug as string,
  opponentSlug: content.data[round]?.slug as string,
  venue: round % 2 === 0 ? 'home' : 'away',
  approach: 'balanced',
  line: 'normal',
  press: 'moderate',
  call: round === 2 ? { kind: 'pressing', minute: 60, to: 'high' } : null,
});

/**
 * Ids are uuids because the database insists, and the database insists for a reason: the id is
 * minted by the client, so two devices that both counted `1` would collide and the second player's
 * match would be swallowed as *already applied*. Minted once here and reused, so the retry below
 * sends the same intents rather than new ones.
 */
const ids = new Map<number, string>();
const idFor = (round: number): string => {
  const existing = ids.get(round);
  if (existing !== undefined) return existing;
  const minted = randomUUID();
  ids.set(round, minted);
  return minted;
};

/** Plays a match the way a client offline would: locally, and remembers what it saw. */
function playedOffline(round: number, id: string = idFor(round)): MatchPlayed {
  const choices = choicesFor(round);
  const result = simulate(buildFixture(league, choices));
  return {
    kind: 'match_played',
    id: intentId(id),
    at: round,
    careerId: 'local',
    seasonOrdinal: 1,
    round,
    choices,
    engineVersion: ENGINE_VERSION,
    predicted: {
      seed: result.seed,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    },
  };
}

beforeAll(async () => {
  await db.exec(SUPABASE_AUTH_SHIM);
  await migrate(client, loadMigrations());
  await seedLeague(client, content.league, content.data);

  const one = async (sql: string, params: readonly unknown[] = []): Promise<string> => {
    const rows = await db.query<{ id: string }>(sql, [...params]);
    return rows.rows[0]?.id as string;
  };
  const competition = await one(`select id from competitions where slug = 'egy-d4'`);
  const club = await one(`select id from clubs where slug = $1`, [content.data[0]?.slug]);
  const user = await one(`insert into users (id) values (gen_random_uuid()) returning id`);
  const manager = await one(
    `insert into managers (user_id, display_name) values ($1, 'م') returning id`,
    [user],
  );
  const careerId = await one(
    `insert into careers (manager_id, club_id, competition_id, engine_version)
     values ($1, $2, $3, $4) returning id`,
    [manager, club, competition, ENGINE_VERSION],
  );
  const seasonId = await one(
    `insert into seasons (career_id, competition_id, ordinal) values ($1, $2, 1) returning id`,
    [careerId, competition],
  );
  deps = { client, league, careerId, seasonId };
});

const transport: Transport = async (intents) => applyIntents(deps, intents);

describe('a season played offline arrives whole', () => {
  const store = memoryStore();
  const offline = [1, 2, 3].map((round) => playedOffline(round));

  it('queues what was played while there was no network', async () => {
    for (const intent of offline) await enqueue(store, intent);
    expect(await store.pending()).toHaveLength(3);
  });

  it('survives a reconnection attempt that fails, losing nothing', async () => {
    // A transport that throws leaves the whole batch queued. Anything else and a dropped
    // connection costs a player his evening.
    const report = await drain(store, async () => {
      throw new Error('still offline');
    });
    expect(report.applied).toEqual([]);
    expect(report.stillPending).toBe(3);
    expect(await store.pending()).toHaveLength(3);
  });

  it('reconnects, and the server ends up with what the client saw', async () => {
    const report = await drain(store, transport);
    expect(report.applied).toHaveLength(3);
    expect(report.diverged).toEqual([]);
    expect(report.rejected).toEqual([]);
    expect(await store.pending()).toHaveLength(0);

    // The agreement, checked against the database rather than against the report.
    const stored = await db.query<{ seed: string; home_score: number; away_score: number }>(
      `select seed, home_score, away_score from matches order by seed`,
    );
    const expected = offline
      .map((intent) => ({
        seed: intent.predicted.seed,
        home_score: intent.predicted.homeScore,
        away_score: intent.predicted.awayScore,
      }))
      .sort((a, b) => a.seed.localeCompare(b.seed));
    expect(stored.rows).toEqual(expected);
  });

  it('brings the trace with it, so the match can still be explained', async () => {
    // A synced match that lost its trace is a scoreline, which is what the competitor stores.
    const traces = await db.query<{ n: number }>(`select count(*)::int as n from match_traces`);
    expect(traces.rows[0]?.n).toBeGreaterThan(0);
    const timeline = await db.query<{ n: number }>(
      `select count(*)::int as n from match_win_probability`,
    );
    expect(timeline.rows[0]?.n).toBe(3 * 91);
    const decisions = await db.query<{ n: number }>(`select count(*)::int as n from decisions`);
    expect(decisions.rows[0]?.n).toBe(1);
  });

  it('plays nothing twice when an acknowledgement was lost', async () => {
    // The client cannot tell a lost reply from a lost request, so it retries. The server has to be
    // the one that remembers — this is what `applied_intents` is for.
    for (const intent of offline) await enqueue(store, intent);
    const before = await db.query<{ n: number }>(`select count(*)::int as n from matches`);

    const report = await drain(store, transport);
    expect(report.already).toHaveLength(3);
    expect(report.applied).toEqual([]);

    const after = await db.query<{ n: number }>(`select count(*)::int as n from matches`);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });
});

describe('the server replays; it does not accept', () => {
  it('reports a divergence and keeps its own answer', async () => {
    // A client claiming a score the choices do not produce. With a deterministic engine that can
    // only mean the two sides ran different engines or different content — a bug that wants a
    // person, not a merge. The server stores what it derived and says so.
    const store = memoryStore();
    const honest = playedOffline(5);
    const lying: Intent = {
      ...honest,
      predicted: { ...honest.predicted, homeScore: 9, awayScore: 0 },
    };
    await enqueue(store, lying);

    const report = await drain(store, transport);
    expect(report.diverged).toHaveLength(1);
    const divergence = report.diverged[0];
    if (divergence?.outcome !== 'diverged') throw new Error('expected a divergence');
    expect(divergence.predicted).toMatch(/^9-0@/);
    expect(divergence.derived).not.toMatch(/^9-0@/);

    const stored = await db.query<{ home_score: number }>(
      `select home_score from matches where seed = $1`,
      [honest.predicted.seed],
    );
    expect(stored.rows[0]?.home_score).toBe(honest.predicted.homeScore);
  });

  it('refuses an intent played on another engine, and keeps it queued', async () => {
    // Replaying under a different engine would produce a different match and storing it would
    // silently rewrite what the player watched. Refusing leaves it for a client that has updated.
    const store = memoryStore();
    await enqueue(store, { ...playedOffline(6), engineVersion: '99.0.0' });

    const report = await drain(store, transport);
    expect(report.rejected).toHaveLength(1);
    expect(report.applied).toEqual([]);
    expect(report.stillPending, 'a refused intent was dropped instead of kept').toBe(1);

    const stored = await db.query<{ n: number }>(
      `select count(*)::int as n from matches where engine_version = '99.0.0'`,
    );
    expect(stored.rows[0]?.n).toBe(0);
  });
});
