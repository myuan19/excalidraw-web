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
      path.join(__dirname, "NewFileDialog.tsx"),
      "utf8",
    );

    expect(hostScss).toContain(".filelist-dialog-host");
    expect(hostScss).toContain("filelist-design-tokens");
    expect(hostScss).toContain("shell-modal-overlay");
    expect(hostScss).toContain("filelist__save-dialog-body");
    expect(hostScss).toContain("shell-modal-soft-primary-btn");
    expect(saveDialog).toContain('import "./fileListDialogHost.scss"');
    expect(saveDialog).toContain("filelist__save-dialog");
    expect(saveDialog).toContain("filelist__save-dialog-btn--primary");
    expect(saveDialog).toContain("shellThemeClassName");
    expect(saveDialog).toContain("filelist-dialog-host");
    expect(saveDialog).toContain("filelist__detail-overlay");
    expect(kindDialog).toContain("shellThemeClassName");
    expect(kindDialog).toContain("filelist-dialog-host");
    expect(kindDialog).toContain("filelist__detail-overlay");
  });
});
