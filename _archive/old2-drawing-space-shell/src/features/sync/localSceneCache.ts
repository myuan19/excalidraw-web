export type LocalSceneCacheRecord = {
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
  document?: unknown;
  deltas: unknown[];
};

const PREFIX = "drawing-space-local-cache-";
const SCHEMA = 1;

function cacheKey(fileId: string) {
  return `${PREFIX}${fileId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseLocalSceneCache(raw: unknown): LocalSceneCacheRecord | null {
  if (!isRecord(raw)) return null;
  let body: Record<string, unknown> = raw;
  if (typeof raw.v === "number" && isRecord(raw.payload)) {
    body = raw.payload;
  }
  const document = body.document ?? body;
  const scene = isRecord(document) && isRecord(document.data)
    ? document.data
    : body;
  const deltas = Array.isArray(body.deltas) ? body.deltas : [];
  if (!isRecord(scene) && !body.document) return null;
  return {
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
    document: body.document,
    deltas,
  };
}

function toStored(record: LocalSceneCacheRecord) {
  return { v: SCHEMA, payload: record };
}

export const LocalSceneCache = {
  get(fileId: string): LocalSceneCacheRecord | null {
    try {
      const raw = localStorage.getItem(cacheKey(fileId));
      if (!raw) return null;
      return parseLocalSceneCache(JSON.parse(raw));
    } catch {
      return null;
    }
  },

  set(fileId: string, record: LocalSceneCacheRecord): void {
    try {
      localStorage.setItem(cacheKey(fileId), JSON.stringify(toStored(record)));
      window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
    } catch {
      // Quota errors are best-effort.
    }
  },

  clear(fileId: string): void {
    localStorage.removeItem(cacheKey(fileId));
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },
};
