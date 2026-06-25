import { beforeEach, describe, expect, it } from "vitest";

import { FileSyncState } from "../data/FileSyncState";
import { hashDocumentSnapshot } from "../data/sceneHash";
import { MindMapAdapter } from "../data/formats/registry";
import { markTabFileDirty } from "../data/tabFileDirtyState";
import {
  getFileDraftStatusLabel,
  LOCAL_DRAFT_STATUS_LABEL,
  readFileDraftStatusLabel,
} from "./useFileDraftStatus";

describe("useFileDraftStatus labels", () => {
  const serverFileId = "server-file-draft-label";
  const localDraftId = `local-draft:${crypto.randomUUID()}`;

  beforeEach(() => {
    FileSyncState.clearHashStateForFile(serverFileId);
    FileSyncState.clearHashStateForFile(localDraftId);
  });

  it("labels local-draft edits as temporary", () => {
    const empty = MindMapAdapter.createEmpty();
    const document = MindMapAdapter.toDocument({
      ...empty,
      root: {
        ...empty.root,
        data: { ...empty.root.data, text: "edited" },
      },
    });
    const hash = hashDocumentSnapshot(document);
    FileSyncState.setDraftHash(localDraftId, hash);
    markTabFileDirty(localDraftId);

    expect(readFileDraftStatusLabel(localDraftId)).toBe(LOCAL_DRAFT_STATUS_LABEL);
    expect(getFileDraftStatusLabel("draft", localDraftId)).toBe(
      LOCAL_DRAFT_STATUS_LABEL,
    );
  });

  it("labels server file edits as unsaved", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    const baseline = hashDocumentSnapshot(document);
    const mutated = MindMapAdapter.toDocument({
      ...document.data,
      root: {
        ...document.data.root,
        data: { ...document.data.root.data, text: "edited" },
      },
    });
    FileSyncState.alignHashes(serverFileId, baseline);
    FileSyncState.setDraftHash(serverFileId, hashDocumentSnapshot(mutated));

    expect(readFileDraftStatusLabel(serverFileId)).toBe("未保存");
    expect(getFileDraftStatusLabel("draft", serverFileId)).toBe("未保存");
  });
});
