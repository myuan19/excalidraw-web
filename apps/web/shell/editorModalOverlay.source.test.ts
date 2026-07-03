import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Editor modal overlay source contract", () => {
  it("registers modal dialogs and hides the floating ball while open", () => {
    const overlaySource = fs.readFileSync(
      path.join(__dirname, "editorModalOverlay.ts"),
      "utf8",
    );
    const sidebarSource = fs.readFileSync(
      path.join(__dirname, "../components/EditorPlatformSidebar.tsx"),
      "utf8",
    );
    const saveDialogSource = fs.readFileSync(
      path.join(__dirname, "../components/PromoteTempFileDialog.tsx"),
      "utf8",
    );

    expect(overlaySource).toContain("notifyEditorModalOverlay");
    expect(overlaySource).toContain("useEditorModalOverlayRegistration");
    expect(sidebarSource).toContain("subscribeEditorModalOverlayChange");
    expect(sidebarSource).toContain("editor-bridge--modal-hidden");
    expect(saveDialogSource).toContain("useEditorModalOverlayRegistration");
  });
});

describe("Editor platform shell theme source contract", () => {
  it("applies shell theme class to the editor platform shell", () => {
    const sidebarSource = fs.readFileSync(
      path.join(__dirname, "../components/EditorPlatformSidebar.tsx"),
      "utf8",
    );
    const scssSource = fs.readFileSync(
      path.join(__dirname, "../components/EditorPlatformSidebar.scss"),
      "utf8",
    );

    expect(sidebarSource).toContain("editor-platform-shell");
    expect(sidebarSource).toContain("shellThemeClassName");
    // 主题订阅已收敛进 useShellTheme（context 内部使用 subscribeShellThemeChange）
    expect(sidebarSource).toContain("useShellTheme");
    expect(scssSource).toContain(".editor-platform-shell.theme--dark");
  });
});

describe("Save dialog folder picker source contract", () => {
  it("uses two-step save dialog with disk/sidebar destination and duplicate gate", () => {
    const pickerSource = fs.readFileSync(
      path.join(__dirname, "../components/FolderPathPicker.tsx"),
      "utf8",
    );
    const saveDialogSource = fs.readFileSync(
      path.join(__dirname, "../components/PromoteTempFileDialog.tsx"),
      "utf8",
    );

    expect(pickerSource).toContain('variant?: "save" | "import"');
    expect(pickerSource).toContain("defaultSelectFirst?: boolean");
    expect(pickerSource).toContain("onTreeLoaded?: (tree: FileTreeResponse) => void");
    expect(pickerSource).toContain("onTreeLoaded?.(tree)");
    expect(saveDialogSource).toContain('"destination" | "name"');
    expect(saveDialogSource).toContain('setStep("name")');
    expect(saveDialogSource).toContain('setStep("destination")');
    expect(saveDialogSource).toContain("hasSaveNameConflict");
    expect(saveDialogSource).toContain("该文件夹中已存在同名文件");
    expect(saveDialogSource).toContain("disabled: busy || !canSave");
    expect(saveDialogSource).not.toContain("defaultSelectFirst");
    expect(saveDialogSource).toContain("disabled: busy || !selectedDestination");
    expect(saveDialogSource).toContain("打开电脑目录");
    expect(saveDialogSource).toContain("filelist__save-destination-list");
    expect(saveDialogSource).toContain("filelist__save-disk-row");
    expect(saveDialogSource).toContain("filelist__tree-row");
    expect(saveDialogSource).not.toContain("filelist__save-destination-divider");
    expect(saveDialogSource).toContain("已选择：");
    expect(saveDialogSource).not.toContain("选择一个本地目录作为保存位置");
    expect(saveDialogSource).not.toContain("filelist__save-dialog-card-stack");
    expect(saveDialogSource).not.toContain("filelist__save-dialog-option-card");
    expect(saveDialogSource).toContain("filelist__save-dialog-actions");
    expect(saveDialogSource).toContain("onClose()");
    expect(saveDialogSource).not.toContain("保存到左侧文件夹");
  });
});
