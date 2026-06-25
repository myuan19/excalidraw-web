/* eslint-disable import/first -- vi.mock calls must be registered before module imports. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFileIdFromHash,
  getLocalCache,
  hasUnsavedChanges,
  listFileHashes,
  readForkBrowserAppStateOverlay,
  setFileId,
} = vi.hoisted(() => ({
  getFileIdFromHash: vi.fn(() => "file-1"),
  getLocalCache: vi.fn(),
  hasUnsavedChanges: vi.fn(() => false),
  listFileHashes: vi.fn(),
  readForkBrowserAppStateOverlay: vi.fn(() => null),
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
  },
}));

vi.mock("../../data/DeltaStorage", () => ({
  DeltaStorage: {
    setFileId,
    restoreSnapshot: vi.fn(async () => {}),
  },
}));

vi.mock("../../data/forkBrowserSceneStorage", () => ({
  clearForkBrowserScene: vi.fn(),
  readForkBrowserAppStateOverlay,
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
  restoreSceneAppState: vi.fn((appState: unknown, overlay?: unknown) => ({
    ...((appState as Record<string, unknown>) ?? {}),
    ...((overlay as Record<string, unknown>) ?? {}),
  })),
}));

import { LocalDraftSessions } from "../../data/localDraftSessions";

import { initializeExcalidrawScene } from "./initializeExcalidrawScene";

describe("initializeExcalidrawScene", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    getFileIdFromHash.mockReturnValue("file-1");
    hasUnsavedChanges.mockReturnValue(false);
    readForkBrowserAppStateOverlay.mockReturnValue(null);
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
    expect(listFileHashes).not.toHaveBeenCalled();
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

  it("does not reopen persisted library sidebar from local cache or browser overlay", async () => {
    getLocalCache.mockReturnValue({
      elements: [{ id: "a", type: "rectangle" }],
      appState: {
        openSidebar: { name: "library", tab: "library" },
        defaultSidebarDockedPreference: true,
      },
      files: {},
      deltas: [],
    });
    readForkBrowserAppStateOverlay.mockReturnValue({
      scrollX: 42,
      openSidebar: { name: "library", tab: "library" },
      defaultSidebarDockedPreference: true,
    } as never);

    const result = await initializeExcalidrawScene();

    expect(result.scene?.appState?.scrollX).toBe(42);
    expect(result.scene?.appState?.openSidebar).toBe(null);
    expect(result.scene?.appState?.defaultSidebarDockedPreference).toBe(false);
  });

  it("canonicalizes local draft cache names from local draft metadata", async () => {
    getFileIdFromHash.mockReturnValue("local-draft:excal-init");
    LocalDraftSessions.upsert({
      id: "local-draft:excal-init",
      name: "草稿画布",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    getLocalCache.mockReturnValue({
      elements: [{ id: "a", type: "rectangle" }],
      appState: { name: "Native Default" },
      files: {},
      deltas: [],
    });

    const result = await initializeExcalidrawScene();

    expect(result.scene?.appState?.name).toBe("草稿画布");
    expect(listFileHashes).not.toHaveBeenCalled();
  });
});

describe("initializeExcalidrawScene remote verify source contract", () => {
  it("keeps browser viewport restore scoped to open, not live remote verify", () => {
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "initializeExcalidrawScene.ts"),
      "utf8",
    );
    const verifyBody = source.slice(
      source.indexOf("export async function verifyExcalidrawRemoteAfterCachedOpen"),
    );

    expect(source).toContain("readForkBrowserAppStateOverlay(fileIdFromHash)");
    expect(verifyBody).toContain("applyRemoteExcalidrawScene");
    expect(verifyBody).toContain("preserveViewport: true");
    expect(verifyBody).toContain("runRemoteSceneApply");
    expect(verifyBody).not.toContain("readForkBrowserAppStateOverlay(");
  });
});
