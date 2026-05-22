import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileSyncState } from "./FileSyncState";
import { LocalSceneCache } from "./localSceneCache";
import { resolveOpenScene } from "./resolveOpenScene";

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
}

describe("resolveOpenScene", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("prefers local cache when server has not changed", () => {
    FileSyncState.markSynced("file-1", "hash-a");
    LocalSceneCache.set("file-1", {
      elements: [{ id: "el-1" }],
      appState: {},
      files: {},
      deltas: [],
    });
    const result = resolveOpenScene({
      fileId: "file-1",
      fileKind: "excalidraw",
      serverDataText: JSON.stringify({ elements: [], appState: {}, files: {} }),
      serverHash: "hash-a",
      draftDataText: null,
    });
    expect(result.source).toBe("local-cache");
    expect(result.dataText).toContain("el-1");
  });
});
