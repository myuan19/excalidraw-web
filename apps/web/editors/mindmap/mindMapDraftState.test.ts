import { beforeEach, describe, expect, it } from "vitest";

import { FileSyncState } from "../../data/FileSyncState";
import { MindMapAdapter } from "../../data/formats/registry";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import {
  adoptMindMapNativeBaseline,
  clearMindMapDraftIfUnchanged,
  isMindMapNativeDirtyPending,
  markMindMapNativeDirtyPending,
  shouldSkipMindMapHydrateSettleBaselineAdopt,
} from "./mindMapDraftState";

describe("mindMapDraftState", () => {
  const fileId = "test-mindmap-file-id";

  beforeEach(() => {
    FileSyncState.clearHashStateForFile(fileId);
  });

  it("adoptMindMapNativeBaseline aligns baseline and draft", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    const serverHash = hashDocumentSnapshot(document);
    FileSyncState.alignHashes(fileId, serverHash);

    const mutated = MindMapAdapter.toDocument({
      ...document.data,
      root: {
        ...document.data.root,
        data: { ...document.data.root.data, text: "changed" },
      },
    });
    adoptMindMapNativeBaseline(fileId, mutated);

    expect(FileSyncState.getBaselineHash(fileId)).toBe(
      hashDocumentSnapshot(mutated),
    );
    expect(FileSyncState.getDraftHash(fileId)).toBe(
      hashDocumentSnapshot(mutated),
    );
    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(false);
  });

  it("adoptMindMapNativeBaseline clears pending dirty on unedited local drafts", () => {
    const draftId = `local-draft:${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.alignHashes(draftId, hashDocumentSnapshot(document));
    markMindMapNativeDirtyPending(draftId);

    adoptMindMapNativeBaseline(draftId, document);

    expect(isMindMapNativeDirtyPending(draftId)).toBe(false);
    expect(FileSyncState.hasUnsavedChanges(draftId)).toBe(false);
  });

  it("clearMindMapDraftIfUnchanged returns true when document matches baseline", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));

    expect(clearMindMapDraftIfUnchanged(fileId, document)).toBe(true);
    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(false);
  });

  it("clearMindMapDraftIfUnchanged returns false when document differs", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));

    const mutated = MindMapAdapter.toDocument({
      ...document.data,
      root: {
        ...document.data.root,
        data: { ...document.data.root.data, text: "edited" },
      },
    });

    expect(clearMindMapDraftIfUnchanged(fileId, mutated)).toBe(false);
  });

  it("marks native dirty when a clean document reports an edit before its snapshot arrives", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));

    expect(markMindMapNativeDirtyPending(fileId)).toBe(true);
    expect(isMindMapNativeDirtyPending(fileId)).toBe(true);
    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(true);
  });

  it("does not replace an existing real draft hash with a transient dirty marker", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    const mutated = MindMapAdapter.toDocument({
      ...document.data,
      root: {
        ...document.data.root,
        data: { ...document.data.root.data, text: "edited" },
      },
    });
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
    const realDraftHash = hashDocumentSnapshot(mutated);
    FileSyncState.setDraftHash(fileId, realDraftHash);

    expect(markMindMapNativeDirtyPending(fileId)).toBe(false);
    expect(FileSyncState.getDraftHash(fileId)).toBe(realDraftHash);
    expect(isMindMapNativeDirtyPending(fileId)).toBe(false);
    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(true);

    expect(clearMindMapDraftIfUnchanged(fileId, document)).toBe(true);
    expect(isMindMapNativeDirtyPending(fileId)).toBe(false);
    expect(FileSyncState.hasUnsavedChanges(fileId)).toBe(false);
  });

  it("does not churn pending dirty hash for repeated native dirty notifications", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));

    expect(markMindMapNativeDirtyPending(fileId)).toBe(true);
    const pendingHash = FileSyncState.getDraftHash(fileId);

    expect(markMindMapNativeDirtyPending(fileId)).toBe(false);
    expect(FileSyncState.getDraftHash(fileId)).toBe(pendingHash);
  });

  it("skips hydrate settle baseline adopt while user edits are pending", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    const mutated = MindMapAdapter.toDocument({
      ...document.data,
      root: {
        ...document.data.root,
        data: { ...document.data.root.data, text: "edited" },
      },
    });
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
    FileSyncState.setDraftHash(fileId, hashDocumentSnapshot(mutated));

    expect(shouldSkipMindMapHydrateSettleBaselineAdopt(fileId, document)).toBe(
      false,
    );

    markMindMapNativeDirtyPending(fileId);
    expect(shouldSkipMindMapHydrateSettleBaselineAdopt(fileId)).toBe(true);
    expect(shouldSkipMindMapHydrateSettleBaselineAdopt(fileId, document)).toBe(
      false,
    );
  });

  it("allows hydrate settle baseline adopt for unedited local drafts", () => {
    const draftId = `local-draft:${crypto.randomUUID()}`;
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    FileSyncState.alignHashes(draftId, hashDocumentSnapshot(document));
    markMindMapNativeDirtyPending(draftId);

    expect(shouldSkipMindMapHydrateSettleBaselineAdopt(draftId, document)).toBe(
      false,
    );
  });
});
