import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSyncState } from "../../data/FileSyncState";
import { ServerSync } from "../../data/ServerSync";
import { hashDocumentSnapshot } from "../../data/sceneHash";

import { useForkFileSave } from "./useForkFileSave";

vi.mock("react", () => ({
  useCallback: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("../../data/ServerSync", () => ({
  ServerSync: {
    getFile: vi.fn(async () => ({
      id: "excal-file",
      name: "Server Name",
    })),
    saveFileImmediate: vi.fn(async () => ({
      ok: true,
      content_sha256: "server-sha",
    })),
  },
}));

describe("useForkFileSave checkpoint orchestration", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.mocked(ServerSync.getFile).mockClear();
    vi.mocked(ServerSync.saveFileImmediate).mockClear();
  });

  it("skips automatic server PUT when Excalidraw content matches the current baseline", async () => {
    const fileId = "excal-file";
    const scene = {
      type: "excalidraw",
      elements: [],
      appState: { name: "ignored-by-hash" },
      files: {},
    };
    const contentHash = hashDocumentSnapshot(scene);
    FileSyncState.alignHashes(fileId, contentHash);
    FileSyncState.setServerHash(fileId, "server-sha-current");

    const save = useForkFileSave(fileId);
    const result = await save(scene, "auto", "Sketch");

    expect(ServerSync.getFile).not.toHaveBeenCalled();
    expect(ServerSync.saveFileImmediate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      content_sha256: "server-sha-current",
    });
  });

  it("keeps manual saves on the server path so checkpoint policy can run", async () => {
    const fileId = "excal-file";
    const scene = {
      type: "excalidraw",
      elements: [],
      appState: {},
      files: {},
    };
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(scene));

    const save = useForkFileSave(fileId);
    await save(scene, "manual", "Sketch");

    expect(ServerSync.saveFileImmediate).toHaveBeenCalledTimes(1);
    expect(ServerSync.saveFileImmediate).toHaveBeenCalledWith(
      fileId,
      expect.objectContaining({
        appState: expect.objectContaining({ name: "Server Name" }),
      }),
      "Server Name",
      undefined,
      expect.objectContaining({ source: "manual" }),
    );
  });

  it("passes force overwrite through the same server save path", async () => {
    const fileId = "excal-file";
    const scene = {
      type: "excalidraw",
      elements: [{ id: "changed" }],
      appState: {},
      files: {},
    };

    const save = useForkFileSave(fileId);
    await save(scene, "manual", "Sketch", undefined, {
      forceOverwrite: true,
    });

    expect(ServerSync.saveFileImmediate).toHaveBeenCalledWith(
      fileId,
      expect.any(Object),
      "Server Name",
      undefined,
      expect.objectContaining({
        forceOverwrite: true,
        source: "manual",
      }),
    );
  });
});
