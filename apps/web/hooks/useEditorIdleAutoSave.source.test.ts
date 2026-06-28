import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("useEditorIdleAutoSave", () => {
  it("delegates rearm to shared idle auto-save modules with pane mount gate", () => {
    const hookSource = readFileSync(
      join(root, "hooks/useEditorIdleAutoSave.ts"),
      "utf8",
    );
    const editorShellSource = readFileSync(
      join(root, "editors/excalidraw/EditorShell.tsx"),
      "utf8",
    );
    const rearmHookSource = readFileSync(
      join(root, "hooks/useIdleAutoSaveRearm.ts"),
      "utf8",
    );

    expect(hookSource).toContain("useEditorPaneMountGate");
    expect(hookSource).toContain("useIdleAutoSaveRearm");
    expect(rearmHookSource).toContain("beforeDirtyCheck");
    expect(rearmHookSource).toContain("visibilitychange");
    expect(editorShellSource).toContain("useEditorIdleAutoSave");
    expect(editorShellSource).toContain("armExcalidrawIdleAutoSave");
    expect(editorShellSource).toContain("excalidrawDirtySessionRef");
    expect(editorShellSource).toContain("touchExcalidrawIdleAutoSaveTimer");
    expect(editorShellSource).toContain("allowInactiveFile: !!pinnedFileId");
    expect(editorShellSource).not.toContain("registerAutoSaveTrigger");
    expect(editorShellSource).not.toContain("subscribeAppSettings");
    expect(editorShellSource).not.toContain("FileSyncState.isDraft");
  });
});
