import type { Intent, IntentId } from './intent.js';
import type { QueueStore } from './queue.js';

/**
 * A queue in memory.
 *
 * Not a test double standing in for the real thing — it is the same contract, and the rules in
 * `queue.ts` are tested against both this and the IndexedDB one, so a rule that holds here has to
 * hold there.
 */
export function memoryStore(): QueueStore & { readonly all: () => readonly Intent[] } {
  const rows = new Map<IntentId, Intent>();
  return {
    put: async (intent) => {
      // Idempotent by id: a client that re-queues after a crash must not double the work.
      if (!rows.has(intent.id)) rows.set(intent.id, intent);
    },
    pending: async () => [...rows.values()],
    forget: async (ids) => {
      for (const id of ids) rows.delete(id);
    },
    all: () => [...rows.values()],
  };
}
