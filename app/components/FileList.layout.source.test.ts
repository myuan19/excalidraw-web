import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const controllerPath = path.join(appRoot, "hooks/useFileListController.tsx");

describe("Files page layout source contract", () => {
  it("uses old2 tailwind file grid and flex shell", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const layoutCss = fs.readFileSync(
      path.join(appRoot, "ui/styles/layout.css"),
      "utf8",
    );

    expect(source).toContain('className="relative flex h-screen flex-col bg-background"');
    expect(source).toContain('className="flex flex-1 overflow-hidden"');
    expect(source).toContain('className="file-grid"');
    expect(layoutCss).toContain(".file-grid {");
  });

  it("keeps layout debug logging behind opt-in flag", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("function isFileListLayoutDebugEnabled()");
    expect(source).toContain("excalidraw-filelist-layout-debug");
    expect(source).toContain("[DEBUG] FileList.layout");
  });

  it("remounts the file grid only when view context changes", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain(
      'key={`${currentFolderId ?? "root"}:${sortKey}:${searchQuery.trim()}`}',
    );
  });

  it("delegates rendering through FileList wrapper", () => {
    const wrapper = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");

    expect(wrapper).toContain("useFileListController");
    expect(wrapper).not.toContain("refreshSeqRef");
  });

  it("keeps sidebar tree styles in FileList.scss", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(styles).toContain("scrollbar-gutter: stable;");
    expect(styles).toContain(".filelist__tree-row-wrap--drop-before::before");
  });
});
