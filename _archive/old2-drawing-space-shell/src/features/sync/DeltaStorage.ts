import { serializeDeltaPayload } from "./serializeDeltaPayload";

const DB_NAME = "drawing-space-deltas-db";
const STORE_NAME = "deltas";
const META_KEY = "__meta__";
const MAX_PERSISTED_DELTAS = 80;

type DeltaMeta = {
  fileId: string | null;
  counter: number;
};

type DeltaEnvelope = {
  schema: 1;
  fileId: string;
  sequence: number;
  createdAt: string;
  payload: unknown;
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

async function getMeta(): Promise<DeltaMeta> {
  if (!isIndexedDbAvailable()) return { fileId: null, counter: 0 };
  return await withStore("readonly", (store) => store.get(META_KEY)) ?? { fileId: null, counter: 0 };
}

async function setValue(key: string, value: unknown): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  await withStore("readwrite", (store) => store.put(value, key));
}

async function deleteValue(key: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  await withStore("readwrite", (store) => store.delete(key));
}

async function getAllKeys(): Promise<string[]> {
  if (!isIndexedDbAvailable()) return [];
  return await withStore("readonly", (store) => store.getAllKeys()) as string[];
}

function deltaKey(sequence: number) {
  return `d:${sequence}`;
}

export const DeltaStorage = {
  async setFileId(fileId: string | null): Promise<void> {
    const meta = await getMeta();
    if (meta.fileId === fileId) return;
    await this.clear();
    await setValue(META_KEY, { fileId, counter: 0 } satisfies DeltaMeta);
  },

  async record(fileId: string, payload: unknown): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const storable = serializeDeltaPayload(payload);
    if (storable == null) return;
    const meta = await getMeta();
    const nextMeta = {
      fileId,
      counter: meta.fileId === fileId ? meta.counter + 1 : 1,
    } satisfies DeltaMeta;
    const envelope = {
      schema: 1,
      fileId,
      sequence: nextMeta.counter,
      createdAt: new Date().toISOString(),
      payload: storable,
    } satisfies DeltaEnvelope;

    try {
      await setValue(deltaKey(nextMeta.counter), envelope);
    } catch {
      return;
    }
    await setValue(META_KEY, nextMeta);

    const staleSequence = nextMeta.counter - MAX_PERSISTED_DELTAS;
    if (staleSequence > 0) {
      await deleteValue(deltaKey(staleSequence)).catch(() => undefined);
    }
  },

  async list(fileId: string): Promise<DeltaEnvelope[]> {
    if (!isIndexedDbAvailable()) return [];
    const keys = (await getAllKeys())
      .filter((key) => key.startsWith("d:"))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const items: DeltaEnvelope[] = [];
    for (const key of keys) {
      const value = await withStore("readonly", (store) => store.get(key));
      if (
        value &&
        typeof value === "object" &&
        (value as DeltaEnvelope).schema === 1 &&
        (value as DeltaEnvelope).fileId === fileId
      ) {
        items.push(value as DeltaEnvelope);
      }
    }
    return items;
  },

  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const keys = await getAllKeys();
    await Promise.all(keys.map((key) => deleteValue(key)));
  },

  async restoreSnapshot(fileId: string, payloads: readonly unknown[]): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const keys = (await getAllKeys()).filter((key) => key.startsWith("d:"));
    await Promise.all(keys.map((key) => deleteValue(key)));
    let counter = 0;
    for (const payload of payloads) {
      if (!payload) continue;
      counter += 1;
      const envelope = {
        schema: 1,
        fileId,
        sequence: counter,
        createdAt: new Date().toISOString(),
        payload,
      } satisfies DeltaEnvelope;
      await setValue(deltaKey(counter), envelope);
    }
    await setValue(META_KEY, { fileId, counter } satisfies DeltaMeta);
  },
};
