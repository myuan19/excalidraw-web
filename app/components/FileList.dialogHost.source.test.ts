import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList dialog host source contract", () => {
  it("scopes --fl-* tokens for overlays opened outside .filelist", () => {
    const hostScss = fs.readFileSync(
      path.join(__dirname, "fileListDialogHost.scss"),
      "utf8",
    );
    const saveDialog = fs.readFileSync(
      path.join(__dirname, "PromoteTempFileDialog.tsx"),
      "utf8",
    );
    const kindDialog = fs.readFileSync(
      path.join(__dirname, "EditorKindDialog.tsx"),
      "utf8",
    );
    const dialogFrame = fs.readFileSync(
      path.join(__dirname, "FileListDialogFrame.tsx"),
      "utf8",
    );

    expect(hostScss).toContain(".filelist-dialog-host");
    expect(hostScss).toContain("filelist-design-tokens");
    expect(hostScss).toContain("shell-modal-overlay");
    expect(hostScss).toContain("filelist__save-dialog-body");
    expect(hostScss).toContain("shell-modal-soft-primary-btn");
    expect(saveDialog).toContain("FileListDialogFrame");
    expect(saveDialog).toContain("filelist__save-dialog");
    expect(saveDialog).toContain("filelist__save-dialog-btn--primary");
    expect(kindDialog).toContain("FileListDialogFrame");
    expect(kindDialog).not.toContain("filelist-dialog-host");
    expect(dialogFrame).toContain("filelist-dialog-host");
    expect(dialogFrame).toContain("shellThemeClassName");
    expect(dialogFrame).toContain("filelist__detail-overlay");
    expect(kindDialog).toContain("filelist__save-dialog-btn--ghost");
    expect(hostScss).not.toMatch(/\.filelist__detail-overlay\s*\{[^@]*background:/s);
    expect(hostScss).toContain("filelist-subtle-scrollbar");
  });

  it("settings drawer uses shell-drawer mixins and standard tokens", () => {
    const settingsScss = fs.readFileSync(
      path.join(__dirname, "SettingsPanel.scss"),
      "utf8",
    );

    expect(settingsScss).toContain("shell-drawer-overlay-root");
    expect(settingsScss).toContain("shell-drawer-panel");
    expect(settingsScss).not.toContain("nb-ai-");
  });

  it("uses a single ShellConfirmHost for destructive confirms", () => {
    const controller = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );
    const embedMgr = fs.readFileSync(
      path.join(__dirname, "EmbedTokenManager.tsx"),
      "utf8",
    );

    expect(controller).toContain("ShellConfirmHost");
    expect(controller).toContain("requestDestructiveConfirm");
    expect(controller).toContain("FILE_LIST_CONFIRM_ROOT_ID");
    expect(controller).not.toContain("useAppConfirmDialog");
    expect(embedMgr).not.toContain("useAppConfirmDialog");
    expect(embedMgr).not.toContain("confirmDialogHost");
  });
});
