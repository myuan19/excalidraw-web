import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isEditorPaneEditPipelineActive,
  listEditorPaneEditPipelineReasons,
  markEditorPaneEditPipeline,
  releaseEditorPaneEditPipelineHold,
  retainEditorPaneEditPipelineHold,
  transferEditorPaneEditPipelineHold,
} from "./editorPaneEditPipeline";

describe("editorPaneEditPipeline", () => {
  const fileId = "edit-pipeline-file";

  afterEach(() => {
    while (isEditorPaneEditPipelineActive(fileId)) {
      for (const reason of listEditorPaneEditPipelineReasons(fileId)) {
        markEditorPaneEditPipeline(fileId, reason)();
      }
    }
  });

  it("tracks active reasons per file and emits sync-state on transitions", () => {
    const listener = vi.fn();
    window.addEventListener("excalidraw-file-sync-state", listener);

    expect(isEditorPaneEditPipelineActive(fileId)).toBe(false);

    const releaseIdle = markEditorPaneEditPipeline(fileId, "idle-save");
    expect(isEditorPaneEditPipelineActive(fileId)).toBe(true);
    expect(listEditorPaneEditPipelineReasons(fileId)).toEqual(["idle-save"]);
    expect(listener).toHaveBeenCalledTimes(1);

    const releaseSave = markEditorPaneEditPipeline(fileId, "native-save");
    expect(listEditorPaneEditPipelineReasons(fileId)).toEqual([
      "idle-save",
      "native-save",
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    releaseIdle();
    expect(isEditorPaneEditPipelineActive(fileId)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    releaseSave();
    expect(isEditorPaneEditPipelineActive(fileId)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener("excalidraw-file-sync-state", listener);
  });

  it("manages ref-held pipeline tokens and transfers between stages", () => {
    const idleHold = { current: null as (() => void) | null };
    const saveHold = { current: null as (() => void) | null };

    retainEditorPaneEditPipelineHold(idleHold, fileId, "idle-save");
    expect(isEditorPaneEditPipelineActive(fileId)).toBe(true);
    expect(listEditorPaneEditPipelineReasons(fileId)).toEqual(["idle-save"]);

    transferEditorPaneEditPipelineHold(
      idleHold,
      saveHold,
      fileId,
      "native-save",
    );
    expect(idleHold.current).toBeNull();
    expect(saveHold.current).not.toBeNull();
    expect(listEditorPaneEditPipelineReasons(fileId)).toEqual(["native-save"]);

    releaseEditorPaneEditPipelineHold(saveHold);
    expect(isEditorPaneEditPipelineActive(fileId)).toBe(false);
  });
});
