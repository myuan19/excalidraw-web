import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList dialog host source contract", () => {
  it("keeps dialog host styles and ShellDialogOverlay on shell modals", () => {
    const hostScss = fs.readFileSync(
      path.join(__dirname, "fileListDialogHost.scss"),
      "utf8",
    );
    const overlaySource = fs.readFileSync(
      path.join(__dirname, "ShellDialogOverlay.tsx"),
      "utf8",
    );
    const saveDialog = fs.readFileSync(
      path.join(__dirname, "PromoteTempFileDialog.tsx"),
      "utf8",
    );
    const kindDialog = fs.readFileSync(
      path.join(__dirname, "NewFileDialog.tsx"),
      "utf8",
    );
    const confirmDialog = fs.readFileSync(
      path.join(__dirname, "FileListConfirmDialog.tsx"),
      "utf8",
    );

    expect(hostScss).toContain(".filelist-dialog-host");
    expect(hostScss).toContain("filelist-design-tokens");
    expect(hostScss).toContain(
      ".filelist__new-btn:not(.filelist__new-btn--danger)",
    );
    expect(hostScss).toContain("@include shell-confirm-dialog-styles");
    expect(hostScss).not.toContain(".app-confirm-dialog-overlay");

    expect(overlaySource).toContain("filelist-dialog-host");
    expect(overlaySource).toContain("filelist__detail-overlay");
    expect(overlaySource).toContain("useLiveShellTheme");

    expect(confirmDialog).toContain("ShellDialogOverlay");
    expect(confirmDialog).toContain("overlay={false}");
    expect(saveDialog).toContain("ShellDialogOverlay");
    expect(kindDialog).toContain("ShellDialogOverlay");
  });
});
