import type { Intent, IntentId } from './intent.js';
import type { QueueStore } from './queue.js';

/**
 * The same queue, in the browser's IndexedDB.
 *
 * Why IndexedDB and not `localStorage`: a career's queue can hold a season's worth of matches, and
 * `localStorage` is a synchronous 5 MB string store — the competitor keeps a 1.2 MB career in one
 * and cannot query it. This keeps one record per intent, keyed by the client-minted id, which is
 * what makes `put` idempotent without reading first.
 *
 * Insertion order is preserved by an autoincrementing key rather than by the client's clock. A
 * device whose clock jumps must not reorder its own history, and `at` on an intent is for a human
 * reading a log, never for deciding anything.
 */

const STORE = 'intents';

export function openQueue(factory: IDBFactory, name = 'dakka-sync'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex('by_intent_id', 'intent.id', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

interface Row {
  readonly seq: number;
  readonly intent: Intent;
}

export function indexedDbStore(db: IDBDatabase): QueueStore {
  return {
    put: async (intent) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const existing = await done(store.index('by_intent_id').getKey(intent.id));
      if (existing === undefined) store.add({ intent });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    pending: async () => {
      const tx = db.transaction(STORE, 'readonly');
      const rows = await done(tx.objectStore(STORE).getAll() as IDBRequest<Row[]>);
      return rows.sort((a, b) => a.seq - b.seq).map((row) => row.intent);
    },

    forget: async (ids: readonly IntentId[]) => {
      const wanted = new Set<string>(ids);
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const rows = await done(store.getAll() as IDBRequest<Row[]>);
      for (const row of rows) if (wanted.has(row.intent.id)) store.delete(row.seq);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}
