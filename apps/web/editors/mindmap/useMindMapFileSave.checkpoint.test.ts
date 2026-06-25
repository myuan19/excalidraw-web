import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSyncState } from "../../data/FileSyncState";
import { MindMapAdapter } from "../../data/formats/registry";
import { ServerSync } from "../../data/ServerSync";
import { hashDocumentSnapshot } from "../../data/sceneHash";

import { useMindMapFileSave } from "./useMindMapFileSave";

vi.mock("react", () => ({
  useCallback: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("../../data/ServerSync", () => ({
  ServerSync: {
    saveFileImmediate: vi.fn(async () => ({
      ok: true,
      content_sha256: "server-sha",
    })),
    saveThumbnailOnly: vi.fn(async () => ({
      ok: true,
    })),
  },
}));

describe("useMindMapFileSave checkpoint orchestration", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.mocked(ServerSync.saveFileImmediate).mockClear();
    vi.mocked(ServerSync.saveThumbnailOnly).mockClear();
  });

  it("skips automatic server PUT when MindMap content matches FileSyncState baseline", async () => {
    const fileId = "mindmap-file";
    const document = MindMapAdapter.toDocument(
      MindMapAdapter.createEmpty("Map"),
    );
    const contentHash = hashDocumentSnapshot(document);
    FileSyncState.alignHashes(fileId, contentHash);
    FileSyncState.setServerHash(fileId, "server-sha-current");

    const save = useMindMapFileSave(fileId, "stale-open-baseline");
    const result = await save(document, "auto", "Map");

    expect(ServerSync.saveFileImmediate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      content_sha256: "server-sha-current",
    });
  });

  it("persists thumbnail saves without writing latest document content", async () => {
    const fileId = "mindmap-file";
    const document = MindMapAdapter.toDocument(
      MindMapAdapter.createEmpty("Map"),
    );
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));

    const save = useMindMapFileSave(fileId, "stale-open-baseline");
    await save(document, "thumbnail", "Map", "<svg></svg>");

    expect(ServerSync.saveFileImmediate).not.toHaveBeenCalled();
    expect(ServerSync.saveThumbnailOnly).toHaveBeenCalledWith(
      fileId,
      "<svg></svg>",
      "Map",
    );
  });

  it("keeps the existing file name when saving after the root was cleared", async () => {
    const fileId = "mindmap-cleared-root-file";
    const document = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty("Map"),
      root: {
        data: {
          text: "<p><br></p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
    });

    const save = useMindMapFileSave(fileId, null);
    await save(document, "manual", "和");

    expect(ServerSync.saveFileImmediate).toHaveBeenCalledWith(
      fileId,
      document,
      "和",
      undefined,
      expect.any(Object),
    );
  });

  it("passes force overwrite through the same server save path", async () => {
    const fileId = "mindmap-file";
    const document = MindMapAdapter.toDocument(
      MindMapAdapter.createEmpty("Map"),
    );

    const save = useMindMapFileSave(fileId, null);
    await save(document, "manual", "Map", undefined, {
      forceOverwrite: true,
    });

    expect(ServerSync.saveFileImmediate).toHaveBeenCalledWith(
      fileId,
      document,
      "Map",
      undefined,
      expect.objectContaining({
        forceOverwrite: true,
        source: "manual",
      }),
    );
  });
});
