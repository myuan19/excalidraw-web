import { afterEach, describe, expect, it } from "vitest";

import { FileSyncState } from "./FileSyncState";
import {
  evaluateCurrentFileModificationState,
  readStoredFileModificationState,
} from "./fileModificationState";
import { MindMapAdapter } from "./formats/MindMapAdapter";

describe("fileModificationState", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("treats mindmap local-draft with only root node as unmodified template", () => {
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

    FileSyncState.setBaselineHash(fileId, "baseline");
    FileSyncState.setDraftHash(fileId, "dirty-looking-hash");
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
});
