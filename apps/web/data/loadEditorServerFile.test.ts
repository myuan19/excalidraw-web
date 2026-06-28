import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearDocumentSessionVersion, getDocumentSessionVersion } from "./documentSessionVersion";
import { FileSyncState } from "./FileSyncState";
import { loadEditorServerFile } from "./loadEditorServerFile";
import { hashSceneSnapshot } from "./sceneHash";
import { ServerSync } from "./ServerSync";

vi.mock("./debugCapability", () => ({
  isDebugAllowed: () => false,
  isDebugRuntimeEnabled: () => false,
}));

const FILE_ID = "load-editor-server-file";

describe("loadEditorServerFile", () => {
  beforeEach(() => {
    clearDocumentSessionVersion(FILE_ID, "test-reset");
    FileSyncState.clearLocalCache(FILE_ID);
    FileSyncState.clearHashStateForFile(FILE_ID);
    vi.restoreAllMocks();
  });

  it("restores session version after local-cache recovery", async () => {
    const scene = {
      elements: [{ id: "a", type: "rectangle" }],
      appState: {},
      files: {},
    };
    const baselineHash = hashSceneSnapshot(scene);
    FileSyncState.setLocalCache(FILE_ID, {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      deltas: [],
      meta: { serverContentSha256: "server-sha", serverVersion: 8 },
    });
    FileSyncState.alignHashes(FILE_ID, baselineHash);
    FileSyncState.setDraftHash(FILE_ID, "draft-hash");
    FileSyncState.setServerHash(FILE_ID, "server-sha");

    const listFileHashes = vi
      .spyOn(ServerSync, "listFileHashes")
      .mockRejectedValue(new Error("offline"));
    const getFile = vi.spyOn(ServerSync, "getFile");

    const file = await loadEditorServerFile(FILE_ID, { force: false });

    expect(file.kind).toBe("excalidraw");
    expect(file.version).toBe(8);
    expect(getDocumentSessionVersion(FILE_ID)).toBe(8);
    expect(listFileHashes).toHaveBeenCalledOnce();
    expect(getFile).not.toHaveBeenCalled();
  });
});
