const DB_NAME = "drawing-space-local-files-db";
const STORE_NAME = "files";
const MAX_UNUSED_AGE_MS = 24 * 60 * 60 * 1_000;

type BinaryFileMirror = {
  id: string;
  data: unknown;
  lastRetrieved: number;
  updatedAt: string;
};

function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export const LocalData = {
  async saveFiles(files: Record<string, unknown> | undefined): Promise<void> {
    if (!isIndexedDbAvailable() || !files) return;
    const entries = Object.entries(files);
    await Promise.all(
      entries.map(([id, data]) => {
        const mirror = {
          id,
          data,
          lastRetrieved: Date.now(),
          updatedAt: new Date().toISOString(),
        } satisfies BinaryFileMirror;
        return withStore("readwrite", (store) => store.put(mirror, id)).then(() => undefined);
      }),
    );
  },

  async getFiles(ids: readonly string[]): Promise<Record<string, unknown>> {
    if (!isIndexedDbAvailable()) return {};
    const loaded: Record<string, unknown> = {};
    for (const id of ids) {
      const mirror = await withStore("readonly", (store) => store.get(id)) as BinaryFileMirror | undefined;
      if (!mirror) continue;
      loaded[id] = mirror.data;
      void withStore("readwrite", (store) => store.put({ ...mirror, lastRetrieved: Date.now() }, id));
    }
    return loaded;
  },

  async clearObsoleteFiles(currentFileIds: readonly string[]): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const keep = new Set(currentFileIds);
    const keys = await withStore("readonly", (store) => store.getAllKeys()) as string[];
    await Promise.all(
      keys.map(async (key) => {
        if (keep.has(key)) return;
        const mirror = await withStore("readonly", (store) => store.get(key)) as BinaryFileMirror | undefined;
        if (!mirror || Date.now() - mirror.lastRetrieved <= MAX_UNUSED_AGE_MS) return;
        await withStore("readwrite", (store) => store.delete(key));
      }),
    );
  },
};
