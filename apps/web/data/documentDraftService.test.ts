import { afterEach, describe, expect, it } from "vitest";

import { FileSyncState } from "./FileSyncState";
import {
  markDocumentCommitted,
  recordExcalidrawDraft,
  recordMindMapDraft,
} from "./documentDraftService";
import { clearTabFileDirty, isTabFileDirty } from "./tabFileDirtyState";

describe("documentDraftService", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearTabFileDirty("file-1");
    clearTabFileDirty("mindmap-1");
  });

  it("records Excalidraw edits as local drafts until committed", () => {
    const fileId = "file-1";
    FileSyncState.setBaselineHash(fileId, "server-hash");

    const hash = recordExcalidrawDraft(fileId, {
      elements: [],
      appState: { name: "Draft" },
      files: {},
    });

    expect(isTabFileDirty(fileId)).toBe(true);
    expect(FileSyncState.getLocalCache(fileId)).toMatchObject({
      appState: { name: "Draft" },
    });
    expect(FileSyncState.getDraftHash(fileId)).toBe(hash);
    expect(FileSyncState.getSyncState(fileId)).toBe("draft");

    markDocumentCommitted(fileId, hash);
    expect(FileSyncState.getSyncState(fileId)).toBe("synced");
    expect(isTabFileDirty(fileId)).toBe(false);
  });

  it("records MindMap edits as local drafts until committed", () => {
    const fileId = "mindmap-1";
    FileSyncState.setBaselineHash(fileId, "server-hash");
    const document = {
      kind: "mindmap",
      containerVersion: 1,
      formatVersion: 1,
      data: {
        name: "MindMap",
        root: { data: { text: "Root" }, children: [] },
        layout: "logicalStructure",
      },
    };

    const hash = recordMindMapDraft(fileId, document);

    expect(isTabFileDirty(fileId)).toBe(true);
    expect(FileSyncState.getLocalCache(fileId)).toMatchObject({
      document: { kind: "mindmap", data: { name: "MindMap" } },
    });
    expect(FileSyncState.getDraftHash(fileId)).toBe(hash);
    expect(FileSyncState.getSyncState(fileId)).toBe("draft");

    markDocumentCommitted(fileId, hash);
    expect(FileSyncState.getSyncState(fileId)).toBe("synced");
    expect(isTabFileDirty(fileId)).toBe(false);
  });
});
