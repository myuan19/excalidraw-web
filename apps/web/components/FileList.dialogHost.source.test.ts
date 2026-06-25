import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList dialog host source contract", () => {
  it("keeps dialog host styles and theme class on save/kind dialogs", () => {
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
    expect(hostScss).toContain(
      ".filelist__new-btn:not(.filelist__new-btn--danger)",
    );
    expect(hostScss).toContain("background: var(--fl-primary-soft);");
    expect(hostScss).toContain("color: var(--fl-primary);");
    expect(saveDialog).toContain('import "./fileListDialogHost.scss"');
    expect(saveDialog).toContain("shellThemeClassName");
    expect(saveDialog).toContain("filelist-dialog-host");
    expect(saveDialog).toContain("filelist__detail-overlay");
    expect(kindDialog).toContain("shellThemeClassName");
    expect(kindDialog).toContain("filelist-dialog-host");
    expect(kindDialog).toContain("filelist__detail-overlay");
  });
});
