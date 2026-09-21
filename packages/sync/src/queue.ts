import type { Intent, IntentId } from './intent.js';

/**
 * The write queue: append, read what is pending, acknowledge what the server took.
 *
 * Append-only and ordered. Nothing in here edits or removes an intent to make room for a newer
 * one — that is the shape a merge conflict would need, and this queue has no merges. An intent
 * leaves only when the server has said it applied it.
 *
 * Storage is behind an interface because the browser has IndexedDB and a test has neither. The
 * queue's rules live here, where they can be tested without one.
 */

export interface QueueStore {
  /** Appends, or does nothing if that id is already queued. Idempotent by id. */
  put(intent: Intent): Promise<void>;
  /** Everything not yet acknowledged, oldest first. */
  pending(): Promise<readonly Intent[]>;
  /** Removes the intents the server confirmed. Unknown ids are ignored. */
  forget(ids: readonly IntentId[]): Promise<void>;
}

/** What the server said about one intent. */
export type Applied =
  | { readonly id: IntentId; readonly outcome: 'applied' }
  /** It had already been applied — a retry after a lost acknowledgement, not an error. */
  | { readonly id: IntentId; readonly outcome: 'already' }
  /** The server replayed the choices and got something else. Its answer stands. */
  | {
      readonly id: IntentId;
      readonly outcome: 'diverged';
      readonly predicted: string;
      readonly derived: string;
    }
  /** Could not be applied at all. Stays queued. */
  | { readonly id: IntentId; readonly outcome: 'rejected'; readonly reason: string };

/** Whatever carries intents to the server. A network, or in a test, a database. */
export type Transport = (intents: readonly Intent[]) => Promise<readonly Applied[]>;

export interface SyncReport {
  readonly sent: number;
  readonly applied: readonly IntentId[];
  readonly already: readonly IntentId[];
  readonly diverged: readonly Applied[];
  readonly rejected: readonly Applied[];
  /** Still queued afterwards, because they were rejected or the transport failed. */
  readonly stillPending: number;
}

const EMPTY: SyncReport = {
  sent: 0,
  applied: [],
  already: [],
  diverged: [],
  rejected: [],
  stillPending: 0,
};

export async function enqueue(store: QueueStore, intent: Intent): Promise<void> {
  await store.put(intent);
}

/**
 * Drains what is pending.
 *
 * **An intent is forgotten only when the server says it holds it** — `applied` or `already`. A
 * divergence also clears, because the server has the match and re-sending would not change its
 * mind; what the divergence needs is a person, not a retry. Anything rejected stays queued, and a
 * transport that throws leaves the whole batch queued, which is what makes this safe to call again
 * after a dropped connection.
 */
export async function drain(store: QueueStore, transport: Transport): Promise<SyncReport> {
  const pending = await store.pending();
  if (pending.length === 0) return EMPTY;

  let results: readonly Applied[];
  try {
    results = await transport(pending);
  } catch {
    // Offline again, or the server fell over. Nothing is lost and nothing is acknowledged.
    return { ...EMPTY, sent: pending.length, stillPending: pending.length };
  }

  const applied = results.filter((r) => r.outcome === 'applied').map((r) => r.id);
  const already = results.filter((r) => r.outcome === 'already').map((r) => r.id);
  const diverged = results.filter((r) => r.outcome === 'diverged');
  const rejected = results.filter((r) => r.outcome === 'rejected');

  await store.forget([...applied, ...already, ...diverged.map((r) => r.id)]);

  return {
    sent: pending.length,
    applied,
    already,
    diverged,
    rejected,
    stillPending: (await store.pending()).length,
  };
}
