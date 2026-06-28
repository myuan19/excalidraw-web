import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controllerPath = path.join(__dirname, "../hooks/useFileListController.tsx");

describe("FileList layout source contract", () => {
  it("keeps file list content scrollable inside the app viewport", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(styles).toContain("height: 100%;");
    expect(styles).toContain("min-height: 100%;");
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

  it("keeps sidebar and thumbnail layout debug logging wired through devDebug file-list channel", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const debugHelper = source.match(
      /function debugFileListLayout\([\s\S]*?\n\}/,
    );

    expect(source).toContain("isFileListLayoutDebugEnabled");
    expect(source).toContain('devDebug("file-list", `layout ${label}`, data)');
    expect(source).toContain("before selectFolder setState");
    expect(source).toContain("after selectFolder topbar layout");
    expect(source).toContain("topbar navigation state commit");
    expect(source).toContain("topbar height changed");
    expect(source).toContain("traceTopbarLayoutFrames");
    expect(source).toContain("topbar frame changed");
    expect(source).toContain("topbar frame trace end");
    expect(source).toContain("collectTopbarLayoutDebug");
    expect(source).toContain("topbarRef");
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

  it("keeps folder drag-and-order debug wired through devDebug file-list channel", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("function debugFolderDnd(");
    expect(source).toContain("isFileListFolderDndDebugEnabled");
    expect(source).toContain('devDebug("file-list", `folder-dnd ${label}`, data)');
    expect(source).toContain("folderDndDebugKeyRef");
  });

  it("keeps file card thumbnail debug logs wired through devDebug file-list channel", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const debugHelper = source.match(
      /function debugFileListThumbnail\([\s\S]*?\n\}/,
    );

    expect(source).toContain("isFileListThumbnailDebugEnabled");
    expect(debugHelper?.[0]).toContain("isFileListThumbnailDebugEnabled()");
    expect(debugHelper?.[0]).not.toContain("isMindMapThumbnailDebugEnabled()");
  });

  it("keeps the toolbar rendered for the local directory root view", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).not.toContain("{!isLocalDirectoryHub ? (");
    expect(source).toContain('const showLocalDirectoryHub = false;');
  });

  it("uses one fixed topbar control height for search, sort, and import", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(styles).toContain("--filelist-topbar-control-height");
    expect(styles).toContain(".filelist__search,\n  .filelist__sort select,\n  .filelist__import-scene-btn,\n  .filelist__topbar-import");
    expect(styles).toContain("height: var(--filelist-topbar-control-height);");
    expect(styles).toContain("height: var(--fl-topbar-control-h);");
    expect(styles).toContain("line-height: 1;");
  });

  it("uses theme tokens for active view-mode toggle borders", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const tokens = fs.readFileSync(
      path.join(__dirname, "../styles/notionUiTokens.scss"),
      "utf8",
    );
    const activeRule = styles.match(
      /\.filelist__view-mode-toggle \{[\s\S]*?&--active \{([\s\S]*?)\n  \}/,
    );

    expect(tokens).toContain("--nb-primary-soft-hover:");
    expect(tokens).toContain("--nb-primary-border-hover:");
    expect(tokens).toContain("--nb-blue-border-hover:");
    expect(activeRule?.[1]).toContain(
      "border-color: var(--nb-primary-border-hover, var(--nb-blue-border-hover));",
    );
    expect(activeRule?.[1]).toContain("background: var(--nb-primary-soft-hover);");
    expect(activeRule?.[1]).not.toContain("color-mix(");
  });

  it("keeps the search and sort row fixed when switching sidebar views", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const topbarRule = styles.match(/\.filelist__topbar \{([\s\S]*?)\n\}/);
    const actionsRule = styles.match(/\.filelist__topbar-actions \{([\s\S]*?)\n  \.filelist__search,/);
    const pathbarRule = styles.match(/\.filelist__pathbar \{([\s\S]*?)\n\}/);

    expect(topbarRule?.[1]).toContain("@include shell-chrome-bar");
    expect(actionsRule?.[1]).toContain("@include shell-toolbar-actions");
    expect(actionsRule?.[1]).toContain("--filelist-topbar-import-min-width");
    expect(pathbarRule?.[1]).toContain("flex-wrap: nowrap;");
    expect(pathbarRule?.[1]).toContain("overflow: hidden;");
  });

  it("keeps the local directory root and subfolder topbar geometry stable", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const tokens = fs.readFileSync(
      path.join(__dirname, "../styles/notionUiTokens.scss"),
      "utf8",
    );
    const designTokens = fs.readFileSync(
      path.join(__dirname, "_filelist-design-tokens.scss"),
      "utf8",
    );
    const pathbarRule = styles.match(/\.filelist__pathbar \{([\s\S]*?)\n\}/);
    const breadcrumbsRule = styles.match(/\.filelist__breadcrumbs \{([\s\S]*?)\n  &::-webkit-scrollbar/);
    const filterChipsRule = styles.match(/\.filelist__filter-chips \{([\s\S]*?)\n\}/);

    expect(tokens).toContain("--nb-shell-toolbar-view-mode-slot-w:");
    expect(designTokens).toContain(
      "--fl-topbar-view-mode-slot-w: var(--nb-shell-toolbar-view-mode-slot-w)",
    );
    expect(pathbarRule?.[1]).toContain("flex: 1 1 0;");
    expect(pathbarRule?.[1]).toContain("width: 0;");
    expect(breadcrumbsRule?.[1]).toContain("flex: 1 1 auto;");
    expect(breadcrumbsRule?.[1]).toContain("scrollbar-width: none;");
    expect(filterChipsRule?.[1]).toContain("display: inline-flex");
  });

  it("shows all recursive local files at the local directory root", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("isLocalDirectoryRoot");
    expect(source).toContain("defaultDataDirectoryOnlyView");
    expect(source).toContain("DEFAULT_DATA_DIRECTORY_ONLY_LABEL");
    expect(source).toContain("defaultDataDirectoryDescendantIds");
    expect(source).toContain("if (!defaultDataDirectoryOnlyView) {");
    expect(source).toContain("list = files.filter((f) => {");
    expect(source).not.toContain("if (!isSelectedFolderId(currentFolderId, foldersById)) {\n        list = [];");
  });

  it("keeps direct-files and default-directory filters beside breadcrumbs", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(source).toContain("FLAT_FOLDER_VIEW_LABEL");
    expect(source).toContain("renderBreadcrumbFilters");
    expect(source).toContain("filelist__filter-chip");
    expect(styles).toContain(".filelist__filter-chip {");
    expect(styles).toContain("filelist-topbar-chip");
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

  it("replays list enter animation when folder or view context changes", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("gridListKey");
    expect(source).toContain("filelist__grid--animate-children");
    expect(source).toContain("currentFolderId ?? \"root\"");
    expect(source).toContain("GRID_ENTER_ANIM_MS");
    expect(source).not.toContain("listAnimationEpoch");
    expect(source).not.toContain("setListAnimationEpoch");
  });

  it("locks desktop topbar height and breadcrumb row metrics", () => {
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");
    const tokens = fs.readFileSync(
      path.join(__dirname, "_filelist-design-tokens.scss"),
      "utf8",
    );
    const breadcrumbRule = styles.match(/^\.filelist__breadcrumbs \{([\s\S]*?)\n\}/m);

    expect(tokens).toContain("--fl-topbar-h:");
    expect(styles).toContain("height: var(--fl-topbar-h);");
    expect(styles).toContain("max-height: var(--fl-topbar-h);");
    expect(styles).toContain("@include shell-chrome-bar");
    expect(styles).toContain(".filelist__filter-chips");
    expect(breadcrumbRule?.[1]).toContain("height: var(--fl-topbar-control-h);");
    expect(breadcrumbRule?.[1]).not.toMatch(/&:last-child[\s\S]*font-weight: 600/);
  });

  it("keeps local-directory breadcrumbs and filter chips stable across folder switches", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("selectLocalDirectoryView()");
    expect(source).toContain("renderBreadcrumbFilters()");
    expect(source).toContain("DEFAULT_DATA_DIRECTORY_ONLY_LABEL");
    expect(source).toContain("defaultDataDirectoryOnlyView &&");
    expect(source).toContain("isLocalDirectoryRoot &&");
    expect(source).toContain("defaultDataDirectoryFolderId");
  });

  it("keeps sidebar tools pinned to the bottom of the scroll column", () => {
    const source = fs.readFileSync(controllerPath, "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "FileList.scss"), "utf8");

    expect(source).toContain('<div className="filelist__sidebar-scroll">');
    expect(source).toMatch(
      /filelist__sidebar-scroll[\s\S]*\{renderSidebarNav\(\)\}[\s\S]*\{renderSidebarTools\(\)\}/,
    );
    expect(styles).toMatch(
      /\.filelist__sidebar-tools \{[\s\S]*margin-top: auto;/,
    );
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
