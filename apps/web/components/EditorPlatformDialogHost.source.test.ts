import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

describe("EditorPlatformDialogHost source contract", () => {
  it("mounts app confirmations above the editor content through the platform shell", () => {
    const cacheHostSource = fs.readFileSync(
      path.join(__dirname, "../shell/EditorTabCacheHost.tsx"),
      "utf8",
    );
    const hostSource = read("EditorPlatformDialogHost.tsx");
    const dialogSource = read("AppConfirmDialog.tsx");
    const dialogStyles = read("AppConfirmDialog.scss");
    const serviceSource = fs.readFileSync(
      path.join(__dirname, "../shell/editorPlatformDialog.ts"),
      "utf8",
    );
    const leaveSource = fs.readFileSync(
      path.join(__dirname, "../shell/editorLeaveConfirm.ts"),
      "utf8",
    );

    expect(cacheHostSource).toContain('<div id="editor-platform-dialog-root" />');
    expect(cacheHostSource).toContain("<EditorPlatformDialogHost />");
    expect(hostSource).toContain("createPortal");
    expect(hostSource).toContain("subscribeEditorPlatformConfirmOpen");
    expect(dialogSource).toContain('role="alertdialog"');
    expect(dialogStyles).toContain(".app-confirm-dialog__btn--primary");
    expect(dialogStyles).toContain("background: var(--nb-primary-soft);");
    expect(dialogStyles).toContain("color: var(--nb-primary);");
    expect(serviceSource).toContain("requestEditorPlatformConfirm");
    expect(leaveSource).toContain("promptServerUpdateConfirm");
    expect(leaveSource).toContain("尚未保存到本地文件夹，是否保存？");
  });

  it("keeps confirm action order and button box model centralized", () => {
    const dialogSource = read("AppConfirmDialog.tsx");
    const dialogStyles = read("AppConfirmDialog.scss");

    expect(dialogSource.indexOf("primaryAction.label")).toBeLessThan(
      dialogSource.indexOf("secondaryAction.label"),
    );
    expect(dialogStyles).toContain(
      "border: var(--nb-border-width) solid transparent;",
    );
    expect(dialogStyles).toContain("border-color: var(--nb-danger-border);");
    expect(dialogStyles).not.toContain(
      "box-shadow: 0 0 0 var(--nb-border-width)",
    );
  });
});
