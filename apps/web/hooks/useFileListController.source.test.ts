import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("useFileListController source contracts", () => {
  it("uses content-hash matched local thumbnails for synced file cards", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain("LocalThumbnailCache.getForContent");
    expect(source).toContain("f.content_sha256");
  });

  it("keys fetched thumbnails by content hash only (not updated_at)", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain("fileThumbnailCacheKey");
    expect(source).toContain("serverThumbnailCacheKey");
    expect(source).not.toContain(
      "nextHashes[file.id] = file.content_sha256 ?? null;",
    );
    expect(source).not.toMatch(
      /fileThumbnailCacheKey[\s\S]*updated_at.*content_sha256|content_sha256.*updated_at/,
    );
  });

  it("passes fetched thumbnail hashes into card thumbnail resolution", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain("fetchedThumbHashByIdRef.current[f.id]");
    expect(source).toContain("const fetchedThumbContentSha = fetchedThumbs[f.id]");
    expect(source).toContain("serverThumbnailCacheKey");
    expect(source).toContain(
      "chooseFileCardThumbnailForFile(\n      f.id,\n      f,\n      fetchedThumbs[f.id] ?? null,\n      fetchedThumbContentSha,",
    );
    expect(source).toContain(
      "resolveFileCardThumbDisplay(\n      f.id,\n      f,\n      fetchedThumbs[f.id] ?? null,\n      fetchedThumbContentSha,",
    );
    expect(source).not.toContain(
      "fetchedThumbHashByIdRef.current[f.id] ?? f.content_sha256",
    );
  });

  it("hides archive count badges when the catalog disables archives", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "useFileListController.tsx"),
      "utf8",
    );
    const archiveBadgeBlock = source.slice(
      source.indexOf("filelist__card-meta"),
      source.indexOf("filelist__card-title-row"),
    );

    expect(archiveBadgeBlock).toContain("catalogCapabilities.archivesEnabled");
    expect(archiveBadgeBlock).toContain("f.archive_count");
  });

  it("keeps desktop file cards to filesystem-backed actions only", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "useFileListController.tsx"),
      "utf8",
    );
    const cardActionsStart = source.indexOf(
      'className="filelist__card-actions"',
    );
    const cardActionsBlock = source.slice(
      cardActionsStart,
      source.indexOf('className="filelist__card-body"', cardActionsStart),
    );

    expect(cardActionsBlock).toContain('title="重命名"');
    expect(cardActionsBlock).toContain("openLocalFile(f)");
    expect(cardActionsBlock).toContain('title="删除"');
    expect(cardActionsBlock).not.toContain("移动到文件夹");
    expect(source).toContain("subscribeCatalogChanges");
    expect(source).not.toContain("renderDefaultWorkspaceTreeRow");
    expect(source).not.toContain("打开默认数据目录");
    expect(source).not.toContain("openDefaultWorkspaceFolder");
    expect(source).not.toContain("filelist__sidebar-default-dir-path");
    expect(source).toContain("expandedFolders[folder.id] ?? false");
    expect(source).toContain(
      "allFilesTreeExpanded, setAllFilesTreeExpanded] = useState(false)",
    );
    expect(source).toContain("handleSceneFiles");
    expect(source).toContain("resolveSceneFilesIntent");
    expect(source).toContain("generateRecentPathThumbnails");
    expect(source).toContain("FileListVirtualGrid");
    expect(source).toContain("FILE_LIST_VIRTUAL_THRESHOLD");
    expect(source).toContain("fileListScrollPerf");
    expect(source).toContain("thumbSwitchLoading");
    expect(source).toContain("thumbBlank");
    expect(source).toContain("readDroppedFileAbsPaths");
    expect(source).toContain('type: "track-recent"');
    expect(source).toContain("workspaceDropOverlayLabel");
    expect(source).toContain('sidebarFileDropTargetId === "__RECENT__"');
    expect(source).toContain("onRecentRowDrop");
    expect(source).toContain("filelist__drop-overlay");
    expect(source).toContain("松手打开");
    expect(source).toContain("松手导入");
    expect(source).not.toContain("松手选择目录");
    expect(source).not.toContain('type: "pick-folder"');
    expect(source).not.toContain("openImportTargetDialog");
    expect(source).not.toContain("importTargetDialogOpen");
    expect(source).not.toContain("openDroppedFilePaths");
    expect(source).not.toContain("filterKnowledgeDocumentPaths");
    expect(source).toContain("clearAllThumbnailServerMisses()");
    expect(source).toContain("Object.values(recentPathCatalogFiles)");
    expect(source).not.toContain("{!isExternalRecentFile ? (");
    expect(source).toContain("removeRecentFileEntry(toRecentPathEntryId(");
    expect(source).toContain("本地目录");
    expect(source).not.toContain("所有文件");
    expect(source).toContain("selectLocalDirectoryView");
    expect(source).toContain('type: "import-needs-folder"');
    expect(source).toContain("importFolderPickerOpen");
    expect(source).toContain("filelist__local-hub");
    expect(source).toContain("toggleAllFilesTree");
    expect(source).toContain("expandFolderAncestorIds");
    expect(source).toContain("isSelectedFolderId(");
    expect(source).not.toContain("selectAllFilesView");
    expect(source).not.toContain('type: "pick-folder"');
    expect(source).not.toContain("openImportTargetDialog");
    expect(source).not.toContain("importTargetDialogOpen");
    expect(source).toContain("startImportWithTarget");
    expect(source).toContain(
      'if (sidebarView !== "all" && !isDesktopEditorHub())',
    );
    expect(source).toContain("ensureDefaultDataDirectoryFolderId");
    expect(source).toContain("!isLocalDirectoryRoot");
    expect(source).toContain("isLocalDirectoryRoot");
    expect(source).toContain('saveTarget: "native" as const');
    expect(source).toContain('saveTarget: "catalog" as const');
    expect(source).toContain("FLAT_FOLDER_VIEW_LABEL");
    expect(source).toContain("DEFAULT_DATA_DIRECTORY_ONLY_LABEL");
    expect(source).toContain("renderBreadcrumbFilters");
    expect(source).toContain("bindDesktopOpenDocumentPaths");
    expect(source).toContain("flatFolderView");
    expect(source).toContain("defaultDataDirectoryOnlyView");
  });

  it("uses remove instead of delete for Recent card actions", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain('const isRecentView = sidebarView === "recent";');
    expect(source).toContain("handleRemoveFromRecent");
    expect(source).toContain('title="重命名"');
    expect(source).toContain('title="在文件管理器中显示"');
    expect(source).toContain('title="移除"');
    expect(source).toContain('? "打开"');
    expect(source).toContain("handleRemoveFromRecent(e, f)");
    expect(source).not.toContain('title="打开"');
    expect(source).not.toContain('title="定位"');
    expect(source).toContain("!isRecentView ? (");
    expect(source).toContain("recentPathResolveFailed");
    expect(source).toContain("recentCatalogFileIdToAbsPath");
    expect(source).toContain("recentPathStaleOnDisk");
    expect(source).toContain("badge={cardBadge}");
  });
});
