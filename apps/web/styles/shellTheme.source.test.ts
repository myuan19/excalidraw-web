import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("file list shell theme layering", () => {
  it("keeps shell semantic tokens in shell/filelistTheme only", () => {
    const globalTokens = fs.readFileSync(
      path.join(__dirname, "notionUiTokens.scss"),
      "utf8",
    );
    const shellTheme = fs.readFileSync(
      path.join(__dirname, "shell/filelistTheme.scss"),
      "utf8",
    );

    expect(globalTokens).toContain('@import "./shell/filelistTheme.scss"');
    expect(globalTokens).not.toContain("--nb-filelist-sidebar-gradient");
    expect(globalTokens).not.toContain(".excalidraw-app.theme--dark .filelist");

    expect(shellTheme).toContain("@mixin filelist-shell-theme-light");
    expect(shellTheme).toContain("@mixin filelist-shell-theme-dark");
    expect(shellTheme).toContain(".filelist.theme--light");
    expect(shellTheme).toContain(".filelist.theme--dark");
    expect(shellTheme).toContain("--nb-filelist-card-fade-bottom");
  });

  it("computes sidebar gradient on .filelist via --fl-sidebar-gradient", () => {
    const aliases = fs.readFileSync(
      path.join(__dirname, "../components/_filelist-design-tokens.scss"),
      "utf8",
    );
    const fileList = fs.readFileSync(
      path.join(__dirname, "../components/FileList.scss"),
      "utf8",
    );

    expect(aliases).toContain("--fl-sidebar-gradient:");
    expect(fileList).toContain("var(--fl-sidebar-gradient)");
    expect(fileList).not.toContain("var(--nb-filelist-sidebar-gradient)");
  });
});
