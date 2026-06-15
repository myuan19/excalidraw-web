import { afterEach, describe, expect, it } from "vitest";

import { FileSyncState } from "./FileSyncState";
import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
  readStoredFileModificationState,
} from "./fileModificationState";
import { MindMapAdapter } from "./formats/MindMapAdapter";
import { hashDocumentSnapshot } from "./sceneHash";
import { clearTabFileDirty, isTabFileDirty } from "./tabFileDirtyState";

describe("fileModificationState", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("treats mindmap local-draft with default root node as unmodified template", () => {
    const fileId = `local-draft:${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());

    FileSyncState.alignHashes(fileId, "same-hash");
    FileSyncState.setLocalCache(fileId, {
      document,
      elements: undefined,
      appState: undefined,
      files: {},
      deltas: [],
    });

    expect(
      evaluateCurrentFileModificationState({
        fileId,
        kind: "mindmap",
        mindMapDocument: document,
      }).modified,
    ).toBe(false);
    expect(readStoredFileModificationState(fileId, "mindmap").draftStatus).toBe(
      "synced",
    );
  });

  it("treats mindmap local-draft root rename as modified", () => {
    const fileId = `local-draft:${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty(),
      root: {
        data: {
          text: "<p>改过的根节点</p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
    });

    const state = evaluateCurrentFileModificationState({
      fileId,
      kind: "mindmap",
      mindMapDocument: document,
    });

    expect(state.modified).toBe(true);
    expect(state.draftStatus).toBe("draft");
  });

  it("does not let a stale template cache hide a dirty local-draft hash", () => {
    const fileId = `local-draft:${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.setBaselineHash(fileId, "baseline");
    FileSyncState.setDraftHash(fileId, "dirty-hash");
    FileSyncState.setLocalCache(fileId, {
      document,
      elements: undefined,
      appState: undefined,
      files: {},
      deltas: [],
    });

    expect(readStoredFileModificationState(fileId, "mindmap").draftStatus).toBe(
      "draft",
    );
  });

  it("treats mindmap local-draft with child nodes as modified", () => {
    const fileId = `local-draft:${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty(),
      root: {
        ...MindMapAdapter.createEmpty().root,
        children: [
          {
            data: {
              text: "<p>子节点</p>",
              richText: true,
            },
            children: [],
          },
        ],
      },
    });

    const state = evaluateCurrentFileModificationState({
      fileId,
      kind: "mindmap",
      mindMapDocument: document,
    });

    expect(state.modified).toBe(true);
    expect(state.draftStatus).toBe("draft");
    expect(state.shouldPromptOnLeave).toBe(true);
  });

  it("clears stale mindmap pending dirty when live document matches baseline", () => {
    const fileId = `server-file-${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    const baselineHash = hashDocumentSnapshot(document);

    FileSyncState.setBaselineHash(fileId, baselineHash);
    FileSyncState.setDraftHash(
      fileId,
      `mindmap-native-dirty-pending:${baselineHash}`,
    );

    const state = evaluateCurrentFileModificationState({
      fileId,
      kind: "mindmap",
      mindMapDocument: document,
    });
    applyFileModificationState(fileId, state, {
      clearLocalCacheWhenSynced: true,
    });

    expect(state.modified).toBe(false);
    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(false);
    expect(FileSyncState.getDraftHash(fileId)).toBe(baselineHash);
    expect(FileSyncState.getLocalEditTime(fileId)).toBeNull();
  });

  it("marks tab-local dirty only when the canonical state is modified", () => {
    const fileId = `server-file-${crypto.randomUUID()}`;
    const cleanDocument = MindMapAdapter.toDocument(
      MindMapAdapter.createEmpty(),
    );
    const dirtyDocument = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty(),
      root: {
        data: {
          text: "<p>Changed</p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
    });
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(cleanDocument));

    const dirtyState = evaluateCurrentFileModificationState({
      fileId,
      kind: "mindmap",
      mindMapDocument: dirtyDocument,
    });
    applyFileModificationState(fileId, dirtyState);

    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(true);
    expect(isTabFileDirty(fileId)).toBe(true);

    const cleanState = evaluateCurrentFileModificationState({
      fileId,
      kind: "mindmap",
      mindMapDocument: cleanDocument,
    });
    applyFileModificationState(fileId, cleanState);

    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(false);
    expect(isTabFileDirty(fileId)).toBe(false);
    clearTabFileDirty(fileId);
  });
});
