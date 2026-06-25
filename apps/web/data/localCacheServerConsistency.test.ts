import { describe, expect, it } from "vitest";

import { FileSyncState } from "./FileSyncState";
import { hashSceneSnapshot } from "./sceneHash";
import { isLocalCacheConsistentWithServerHash } from "./localCacheServerConsistency";

describe("isLocalCacheConsistentWithServerHash", () => {
  const fileId = "file-consistency";

  it("returns true when baseline and cache match server sha", () => {
    const scene = {
      elements: [{ id: "a", type: "rectangle" }],
      appState: {},
      files: {},
    };
    const hash = hashSceneSnapshot(scene);
    FileSyncState.setLocalCache(fileId, {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      deltas: [],
      meta: { serverContentSha256: "server-sha-a" },
    });
    FileSyncState.alignHashes(fileId, hash);
    FileSyncState.setServerHash(fileId, "server-sha-a");

    expect(isLocalCacheConsistentWithServerHash(fileId, "server-sha-a")).toBe(
      true,
    );
  });

  it("returns false when cached server sha differs", () => {
    const scene = {
      elements: [{ id: "a", type: "rectangle" }],
      appState: {},
      files: {},
    };
    const hash = hashSceneSnapshot(scene);
    FileSyncState.setLocalCache(fileId, {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      deltas: [],
      meta: { serverContentSha256: "older-server-sha" },
    });
    FileSyncState.alignHashes(fileId, hash);

    expect(isLocalCacheConsistentWithServerHash(fileId, "server-sha-a")).toBe(
      false,
    );
  });
});
