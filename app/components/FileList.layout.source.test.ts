import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controllerPath = path.join(__dirname, "../hooks/useFileListController.tsx");

describe("FileList layout source contract", () => {
  it("keeps file list content scrollable inside the app viewport", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(styles).toContain("height: 100vh;");
    expect(styles).toContain("grid-template-columns: auto minmax(0, 1fr);");
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain(".filelist__workspace {\n");
    expect(styles).toContain(".filelist__body {\n");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain("-webkit-overflow-scrolling: touch;");
  });

  it("reserves main scrollbar space so thumbnail loading does not shift layout", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const bodyRule = styles.match(/\.filelist__body \{([\s\S]*?)\n\}/);

    expect(bodyRule?.[1]).toContain("overflow-y: auto;");
    expect(bodyRule?.[1]).toContain("scrollbar-gutter: stable;");
  });

  it("keeps the desktop sidebar content-sized while reserving scrollbar space", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const tokens = fs.readFileSync(
      path.join(__dirname, "../styles/notionUiTokens.scss"),
      "utf8",
    );

    expect(styles).toContain("grid-template-columns: auto minmax(0, 1fr);");
    expect(styles).toContain("width: max-content;");
    expect(tokens).toContain("--nb-filelist-sidebar-stable-min: 13.75rem;");
    expect(styles).toContain("min-width: max(");
    expect(styles).toContain("var(--nb-filelist-sidebar-min),");
    expect(styles).toContain(
      "var(--nb-filelist-sidebar-stable-min)",
    );
    expect(styles).toContain(
      "max-width: min(21.25rem, var(--nb-filelist-sidebar-max-vw));",
    );
    expect(styles).toContain("scrollbar-gutter: stable;");
  });

  it("keeps the all-files sidebar row stretched to the content-sized sidebar width", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const rootRule = styles.match(/\.filelist__tree-root \{([\s\S]*?)\n\}/);

    expect(rootRule?.[1]).toContain("width: 100%;");
    expect(rootRule?.[1]).toContain("box-sizing: border-box;");
  });

  it("resets sidebar tree button boxes so refresh cannot change icon spacing", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const buttonRule = styles.match(
      /\.filelist__tree-toggle,\n\.filelist__tree-name,\n\.filelist__tree-action \{([\s\S]*?)\n\}/,
    );
    const ruleBody = buttonRule?.[1] ?? "";

    expect(ruleBody).toContain("appearance: none;");
    expect(ruleBody).toContain("box-sizing: border-box;");
    expect(ruleBody).toContain("margin: 0;");
    expect(ruleBody).toContain("padding: 0;");
    expect(ruleBody).toContain("font: inherit;");
  });

  it("keeps sidebar and thumbnail layout debug logging behind a separate opt-in flag", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const debugHelper = source.match(
      /function debugFileListLayout\([\s\S]*?\n\}/,
    );

    expect(source).toContain("function isFileListLayoutDebugEnabled()");
    expect(source).toContain("excalidraw-filelist-layout-debug");
    expect(source).toContain('devDebug("file-list", `layout ${label}`, data)');
    expect(source).toContain("before selectFolder setState");
    expect(source).toContain("before thumbnail state update");
    expect(source).toContain("thumbnail committed layout");
    expect(source).toContain("thumbnail next frame layout");
    expect(source).toContain("setFetchedThumbsWithLayoutDebug");
    expect(debugHelper?.[0]).toContain("isFileListLayoutDebugEnabled()");
    expect(source).not.toContain("FileList.selectFolder | click");
  });

  it("does not change sidebar row font weight on selection because width is content-sized", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const activeRule = styles.match(
      /\.filelist__tree-root--active,\n\.filelist__tree-row--active \{([\s\S]*?)\n\}/,
    );

    expect(activeRule?.[1]).toContain("background: var(--fl-primary-soft);");
    expect(activeRule?.[1]).toContain("color: var(--fl-primary);");
    expect(activeRule?.[1]).not.toContain("font-weight:");
  });

  it("keeps folder drag-and-order debug behind a separate opt-in flag", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("function debugFolderDnd(");
    expect(source).toContain("excalidraw-filelist-folder-dnd-debug");
    expect(source).toContain('devDebug("file-list", `folder-dnd ${label}`, data)');
    expect(source).toContain("folderDndDebugKeyRef");
  });

  it("keeps file card thumbnail debug logs behind a separate opt-in flag", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const debugHelper = source.match(
      /function debugFileListThumbnail\([\s\S]*?\n\}/,
    );

    expect(source).toContain("function isFileListThumbnailDebugEnabled()");
    expect(source).toContain("excalidraw-filelist-thumbnail-debug");
    expect(debugHelper?.[0]).toContain("isFileListThumbnailDebugEnabled()");
    expect(debugHelper?.[0]).not.toContain("isMindMapThumbnailDebugEnabled()");
  });

  it("renders sidebar drag indicators as overlays that do not affect layout", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(source).toContain(
      'showBefore ? "filelist__tree-row-wrap--drop-before" : ""',
    );
    expect(source).toContain(
      'showAfter ? "filelist__tree-row-wrap--drop-after" : ""',
    );
    expect(source).not.toContain(
      '{showBefore && <div className="filelist__tree-drop-line" aria-hidden />}',
    );
    expect(source).not.toContain(
      '{showAfter && <div className="filelist__tree-drop-line" aria-hidden />}',
    );
    expect(styles).toContain(".filelist__tree-row-wrap--drop-before::before");
    expect(styles).toContain(".filelist__tree-row-wrap--drop-after::after");
    expect(styles).toContain("position: absolute;");
    expect(styles).toContain("height: 2px;");
    expect(styles).toContain("background: var(--fl-nav-outline-drop);");
    expect(styles).toContain("pointer-events: none;");
  });

  it("remounts the file grid only when view context changes so refresh does not replay animations", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain(
      'key={`${currentFolderId ?? "root"}:${sortKey}:${searchQuery.trim()}`}',
    );
    expect(source).not.toContain("listAnimationEpoch");
    expect(source).not.toContain("setListAnimationEpoch");
  });

  it("delegates rendering through FileList wrapper", () => {
    const wrapper = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");

    expect(wrapper).toContain("useFileListController");
    expect(wrapper).not.toContain("refreshSeqRef");
  });

  it("uses left-right shell with sidebar tools and a single new entry card", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("renderSidebar()");
    expect(source).toContain("filelist__workspace");
    expect(source).toContain("filelist__topbar");
    expect(source).toContain("filelist__sidebar-tools");
    expect(source).toContain("filelist__topbar-import");
    expect(source).toContain("renderTopbarImport");
    expect(source).toContain("detectImportCandidateKinds");
    expect(source).toContain('key="new-entry"');
    expect(source).not.toContain("renderNewFileCard");
    expect(source).not.toContain('className="filelist__new-btn" onClick={openNewFileDialog}');
    expect(source).not.toContain("打开编辑器");
  });
});
