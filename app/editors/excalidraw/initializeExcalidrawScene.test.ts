import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFileIdFromHash,
  getLocalCache,
  hasUnsavedChanges,
  listFileHashes,
  setFileId,
} = vi.hoisted(() => ({
  getFileIdFromHash: vi.fn(() => "file-1"),
  getLocalCache: vi.fn(),
  hasUnsavedChanges: vi.fn(() => false),
  listFileHashes: vi.fn(),
  setFileId: vi.fn(async () => {}),
}));

vi.mock("../../data/fileIdFromHash", () => ({
  getFileIdFromHash,
}));

vi.mock("../../data/FileSyncState", () => ({
  FileSyncState: {
    getLocalCache,
    hasUnsavedChanges,
    getBaselineHash: vi.fn(() => null),
    setBaselineHash: vi.fn(),
    setDraftHash: vi.fn(),
    getServerHash: vi.fn(() => "sha-local"),
    setServerHash: vi.fn(),
    isServerChanged: vi.fn(() => false),
    alignHashes: vi.fn(),
    setLocalCache: vi.fn(),
    setServerSyncedLocalCache: vi.fn(),
    setLocalDraftCache: vi.fn(),
  },
}));

vi.mock("../../data/DeltaStorage", () => ({
  DeltaStorage: {
    setFileId,
    restoreSnapshot: vi.fn(async () => {}),
  },
}));

vi.mock("../../data/forkBrowserSceneStorage", () => ({
  readForkBrowserAppStateOverlay: vi.fn(() => null),
}));

vi.mock("../../data/ServerSync", () => ({
  ServerSync: {
    listFileHashes,
    getFile: vi.fn(),
  },
}));

vi.mock("../../data/sceneHash", () => ({
  hashSceneSnapshot: vi.fn(() => "hash-local"),
}));

vi.mock("../../data/sceneRestore", () => ({
  restoreSceneElements: vi.fn((elements: unknown[]) => elements),
  restoreSceneAppState: vi.fn((appState: unknown) => appState),
}));

import { initializeExcalidrawScene } from "./initializeExcalidrawScene";

describe("initializeExcalidrawScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileIdFromHash.mockReturnValue("file-1");
    hasUnsavedChanges.mockReturnValue(false);
  });

  it("uses local fast path without blocking on listFileHashes", async () => {
    getLocalCache.mockReturnValue({
      elements: [{ id: "a", type: "rectangle" }],
      appState: {},
      files: {},
      deltas: [],
    });
    const phases: string[] = [];
    const result = await initializeExcalidrawScene({
      onPhase: (phase) => phases.push(phase),
    });

    expect(result.deferRemoteVerify).toBe(true);
    expect(listFileHashes).toHaveBeenCalled();
    expect(phases).toContain("preparing_surface");
  });

  it("blocks on listFileHashes when no local cache exists", async () => {
    getLocalCache.mockReturnValue(null);
    listFileHashes.mockResolvedValue([]);
    const phases: string[] = [];
    const result = await initializeExcalidrawScene({
      onPhase: (phase) => phases.push(phase),
    });

    expect(result.deferRemoteVerify).toBe(false);
    expect(listFileHashes).toHaveBeenCalled();
    expect(phases).toContain("checking_remote");
  });
});
