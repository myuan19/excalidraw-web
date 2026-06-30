import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  EDITOR_MAX_IMAGE_FILE_BYTES,
  formatEditorMaxImageFileSizeMb,
} from "@excalidraw/common";
import { FileListConfirmDialog } from "../components/FileListConfirmDialog";
import { ShellDialogOverlay } from "../components/ShellDialogOverlay";
import {
  applyMainSiteDocumentBranding,
  HOME_APP_TITLE,
  MAIN_SITE_ICON,
} from "../lib/appBranding";
import { serverThumbnailCacheKey } from "../data/serverThumbnailUrl";
import { shellThemeClassName, useShellTheme } from "./useShellTheme";
import { createLogger, logFileListOpen } from "../lib/logger";
import { traceResourceOp, traceTreeStateApply } from "../lib/resourceTrace";
import {
  devDebug,
  isDevDebugChannelEnabled,
  isFileListFolderDndDebugEnabled,
  isFileListLayoutDebugEnabled,
  isFileListThumbnailDebugEnabled,
} from "../lib/devDebug";
import { traceFileOpen, id8 } from "../lib/interactionDebugTrace";
import {
  startIssueDiagTimer,
  traceFileListSortOrder,
  traceHomeRenderMount,
  traceHomeRenderPaint,
  traceIssueDiag,
} from "../lib/issueDiagTrace";
import {
  traceThumbFetchAllowChange,
  traceThumbFetchedStateApply,
  traceThumbHashInvalidate,
} from "../lib/thumbPipelineTrace";
import { bindDesktopOpenDocumentPaths } from "../shell/desktopOpenDocuments";
import { isDebugRuntimeEnabled } from "../data/debugCapability";
import { readFileDraftStatus } from "./useFileDraftStatus";
import {
  readFileListTreeCache,
  writeFileListTreeCache,
  patchFileListTreeCacheSavedFile,
} from "../data/fileListSessionCache";
import { FileSyncState } from "../data/FileSyncState";
import { onCrossTabFileSaved } from "../data/crossTabFileSync";
import { resolveFileCardThumbDisplay } from "../data/fileCardThumbDisplay";
import { chooseFileCardThumbnailForFile } from "../data/resolveFileCardThumbnail";
import { formatImportErrorMessage } from "../data/importExcalidrawScene";
import {
  LocalThumbnailCache,
  LOCAL_THUMB_UPDATED_EVENT,
} from "../data/localThumbnailCache";
import { detectImportCandidateKinds } from "../data/detectImportCandidates";
import { FileCardThumb } from "../components/FileCardThumb";
import { EditorKindDialog, NewFileDialog } from "../components/NewFileDialog";
import { SaveNewDocumentDialog } from "../components/PromoteTempFileDialog";
import type { DiskFolderPickResult } from "../components/saveDialogUtils";
import { bootstrapLocalDraftSession } from "../data/bootstrapLocalDraftSession";
import { discardLocalDraftSession } from "../data/discardLocalDraftSession";
import { downloadLocalDraftFile } from "../data/downloadLocalDraftFile";
import { defaultNameForDocumentKind } from "../data/defaultDocumentName";
import { purgeLegacyTempArtifacts } from "../data/documentHash";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import {
  LOCAL_DRAFT_SESSIONS_CHANGE_EVENT,
  LocalDraftSessions,
  draftSessionToServerFile,
} from "../data/localDraftSessions";
import {
  findRecentPathCatalogFile,
  getRecentFileEntries,
  getRecentPathForFileId,
  getRecentPathFromEntryId,
  isRecentPathEntry,
  RECENT_FILES_CHANGE_EVENT,
  removeRecentFileEntry,
  resolveRecentEntryToFileId,
  toRecentPathEntryId,
  touchRecentOpenedFile,
  touchRecentTrackedFiles,
} from "../data/recentFiles";
import {
  addMappedFolderRoot,
  ensureDefaultDataDirectoryMapped,
  resolveDefaultDataDirectoryPath,
} from "../data/mappedFolderClient";
import { readDroppedFileAbsPaths } from "../lib/droppedFilePath";
import {
  computeFileListGridListedCellCount,
} from "../lib/fileListGridLayout";
import {
  attachFileListScrollElement,
  recordFileListScrollContext,
  refreshFileListScrollMonitoring,
  startFileListScrollMonitoring,
} from "../lib/fileListScrollPerf";
import {
  collectRecentAbsPathsFromEntries,
  fingerprintRecentAbsPaths,
  findCatalogFileByAbsPath,
  mergeRecentPathCatalogBatch,
  mergeRecentPathCatalogFromTree,
  resolveRecentPathCatalogByPaths,
} from "../data/recentPathCatalogSync";
import { isDesktopEditorHub, canOpenRecentByCatalogPath } from "../lib/runtimePlatform";
import {
  isExcalidrawPointerDragActive,
  runAfterExcalidrawPointerDrag,
  shouldDeferHeavyHostWorkForExcalidraw,
} from "../editors/excalidraw/excalidrawPointerDrag";
import {
  fileAwaitingNativeThumbnail,
  generateRecentPathThumbnails,
  persistTrackedFileThumbnail,
  trackCatalogPathsToRecent,
} from "../data/trackCatalogPathsToRecent";
import {
  clearNativeThumbnailPending,
  markNativeThumbnailPending,
  subscribeNativeThumbnailPending,
} from "../data/nativeThumbnailPending";
import {
  clearThumbnailSavePending,
  markThumbnailSavePending,
  subscribeThumbnailSavePending,
} from "../data/thumbnailSavePending";
import { editorRegistry } from "../editors";
import type { EditorPlugin } from "../editors/types";
import { openEditorFileTab } from "../shell/editorTabNavigation";
import {
  deriveCatalogScanNoticeForRuntime,
  findDefaultDataDirectoryFolderId,
} from "../data/desktopCatalogPolicy";
import {
  fingerprintCatalogListing,
  mergeExpandedFolderState,
} from "../data/fileTreeSync";
import {
  cancelDebouncedFileListRefresh,
  scheduleDebouncedFileListRefresh,
  shouldSkipSilentTreeRefreshAfterIncrementalSave,
  markFileListIncrementalSave,
} from "../data/fileListRefreshCoordinator";
import {
  dispatchFileListIncrementalApply,
  FILE_LIST_INCREMENTAL_APPLY_EVENT,
  mergeFileListTreeWithSessionCachePatches,
  mergeServerFilePatch,
  readFileListIncrementalPatch,
  resolveListSortUpdatedAt,
  type FileListIncrementalPatch,
} from "../data/fileListIncrementalPatch";
import {
  ServerSync,
  type FileOrderItem,
  type FileTreeResponse,
  type MappingRootResult,
  type ServerFile,
  type ServerFolder,
} from "../data/ServerSync";
import {
  ensureAIConfigLoaded,
  isAIConfigured,
  subscribeAIConfig,
} from "../data/aiConfig";
import { useStartupFileListGate, useRegisterStartupHomeTreeLoader, useStartupPhase } from "../startup/StartupCoordinatorProvider";
import {
  notifyStartupHomeTreeReady,
  STARTUP_LOAD_HOME_TREE_EVENT,
} from "../startup/StartupCoordinator";
import { isStartupPhaseAtLeast } from "../startup/startupPhases";
import {
  computeThumbFetchAllowIds,
  measureVisibleThumbIdsInRoot,
  THUMB_VISIBILITY_ROOT_MARGIN_PX,
} from "../data/thumbCoverage";
import { buildThumbnailDraftSlot } from "../data/thumbnailLifecycle";
import { EmbedTokenManager } from "../components/EmbedTokenManager";
import { DocumentPreviewDialog } from "../components/DocumentPreviewDialog";
import { FileListToastStack } from "../components/FileListToastStack";
import { ImportDestinationDialog } from "../components/ImportDestinationDialog";
import { SettingsPanel } from "../components/SettingsPanel";
import {
  WEB_CATALOG_CAPABILITIES,
  isCorruptCatalogFile,
  type CatalogCapabilities,
  resolveRuntimeCatalogCapabilities,
} from "../data/catalogCapabilities";

import {
  clearAllThumbnailServerMisses,
  clearThumbnailServerMiss,
  pruneThumbnailServerMisses,
} from "../data/thumbnailServerFetchMiss";
import { isNativeMindMapThumbnailSvg } from "../data/thumbnailSvg";
import { useThumbnailPipeline } from "./useThumbnailPipeline";

import "../components/FileList.scss";
import "../components/fileListDialogHost.scss";

const logList = createLogger({ module: "fileList" });
const logPipe = createLogger({ module: "thumbPipeline" });

function getDebugSvgAttr(
  svgMarkup: string | null,
  name: string,
): string | null {
  if (!svgMarkup) {
    return null;
  }
  return (
    svgMarkup
      .match(/<svg\b[^>]*>/i)?.[0]
      .match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? null
  );
}

function fileThumbnailCacheKey(
  file: Pick<ServerFile, "content_sha256">,
): string | null {
  return serverThumbnailCacheKey(file.content_sha256);
}

function stripKnownDocumentExtension(name: string): string {
  return (
    name.match(
      /^(.*?)(?:\.excalidraw\.json|\.mindmap\.json|\.excalidraw|\.smm)$/i,
    )?.[1] ?? name
  );
}

function recentPathAfterRename(
  absPath: string,
  name: string,
  kind: string | null | undefined,
): string {
  const extension =
    absPath.match(
      /(\.excalidraw\.json|\.mindmap\.json|\.excalidraw|\.smm)$/i,
    )?.[0] ?? (kind === "mindmap" ? ".smm" : ".excalidraw");
  const separatorIndex = Math.max(
    absPath.lastIndexOf("/"),
    absPath.lastIndexOf("\\"),
  );
  const dir = separatorIndex >= 0 ? absPath.slice(0, separatorIndex + 1) : "";
  return `${dir}${stripKnownDocumentExtension(name)}${extension}`;
}

function debugFileListThumbnail(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isFileListThumbnailDebugEnabled()) {
    return;
  }
  devDebug("file-list", `renderFileCard ${label}`, data);
}

function summarizeFileListTreeForDebug(tree: {
  folders?: ServerFolder[];
  files?: ServerFile[];
  scan?: { state?: string | null; pass?: string | null; running?: boolean };
}) {
  const folders = tree.folders ?? [];
  const files = tree.files ?? [];
  return {
    folders: folders.length,
    files: files.length,
    rootFolders: folders.filter((folder) => folderParentId(folder) == null)
      .length,
    mappingRoots: folders.filter((folder) => folder.is_mapping_root).length,
    pendingFiles: files.filter(
      (file) => file.health === "pending" || file.scan_pending,
    ).length,
    corruptFiles: files.filter((file) => isCorruptCatalogFile(file)).length,
    mindmaps: files.filter((file) => editorRegistry.resolveKind(file.kind) === "mindmap")
      .length,
    withThumb: files.filter((file) => file.has_thumbnail).length,
    withSha: files.filter((file) => file.content_sha256).length,
    scanState: tree.scan?.state ?? null,
    scanPass: tree.scan?.pass ?? null,
    scanRunning: tree.scan?.running ?? null,
  };
}

function roundedNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function readLayoutDebugNumber(
  data: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = data?.[key];
  return typeof value === "number" ? value : null;
}

function layoutFrameDelta(
  previous: Record<string, unknown> | null | undefined,
  current: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of ["x", "y", "width", "height"]) {
    const before = readLayoutDebugNumber(previous, key);
    const after = readLayoutDebugNumber(current, key);
    if (before === null || after === null) {
      continue;
    }
    const delta = roundedNumber(after - before);
    if (Math.abs(delta) > 0.5) {
      deltas[key] = delta;
    }
  }
  return deltas;
}

function layoutRect(el: Element | null): Record<string, unknown> | null {
  if (!el) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  const htmlEl = el as HTMLElement;
  return {
    x: roundedNumber(rect.x),
    y: roundedNumber(rect.y),
    width: roundedNumber(rect.width),
    height: roundedNumber(rect.height),
    clientWidth: roundedNumber(htmlEl.clientWidth),
    scrollWidth: roundedNumber(htmlEl.scrollWidth),
    offsetWidth: roundedNumber(htmlEl.offsetWidth),
    clientHeight: roundedNumber(htmlEl.clientHeight),
    scrollHeight: roundedNumber(htmlEl.scrollHeight),
    hasVerticalScrollbar: htmlEl.scrollHeight > htmlEl.clientHeight,
  };
}

function computedLayoutInfo(
  el: Element | null,
): Record<string, unknown> | null {
  if (!el) {
    return null;
  }
  const style = window.getComputedStyle(el);
  return {
    ...layoutRect(el),
    cssWidth: style.width,
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    overflowY: style.overflowY,
    scrollbarGutter: style.scrollbarGutter,
  };
}

function topbarElementLayoutInfo(el: Element | null): Record<string, unknown> | null {
  if (!el) {
    return null;
  }
  const style = window.getComputedStyle(el);
  const base = layoutRect(el);
  if (!base) {
    return null;
  }
  return {
    ...base,
    cssHeight: style.height,
    cssMinHeight: style.minHeight,
    lineHeight: style.lineHeight,
    flexWrap: style.flexWrap,
    alignItems: style.alignItems,
    alignSelf: style.alignSelf,
    flexShrink: style.flexShrink,
    flexGrow: style.flexGrow,
    gap: style.gap,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    borderBottomWidth: style.borderBottomWidth,
    boxSizing: style.boxSizing,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
  };
}

function collectTopbarLayoutDebug(topbar: HTMLElement | null): Record<string, unknown> | null {
  if (!topbar) {
    return null;
  }
  const pick = (selector: string) =>
    topbarElementLayoutInfo(topbar.querySelector(selector));
  const breadcrumbs = topbar.querySelector(".filelist__breadcrumbs");
  const breadcrumbStyle = breadcrumbs
    ? window.getComputedStyle(breadcrumbs)
    : null;

  return {
    topbar: topbarElementLayoutInfo(topbar),
    pathbar: pick(".filelist__pathbar"),
    breadcrumbs: breadcrumbs
      ? {
          ...topbarElementLayoutInfo(breadcrumbs),
          segmentCount: breadcrumbs.querySelectorAll("button").length,
          textContentLength: breadcrumbs.textContent?.trim().length ?? 0,
          hasHorizontalOverflow:
            breadcrumbs.scrollWidth > breadcrumbs.clientWidth + 1,
          scrollWidth: breadcrumbs.scrollWidth,
          clientWidth: breadcrumbs.clientWidth,
          lineHeight: breadcrumbStyle?.lineHeight,
        }
      : null,
    pathbarLabel: pick(".filelist__pathbar-label"),
    topbarActions: pick(".filelist__topbar-actions"),
    viewModeToggle: pick(".filelist__filter-chip"),
    searchWrap: pick(".filelist__search-wrap"),
    searchInput: pick(".filelist__search"),
    sort: pick(".filelist__sort"),
    sortSelect: pick(".filelist__sort select"),
    topbarImport: pick(".filelist__topbar-import"),
    flTopbarControlH: window
      .getComputedStyle(topbar)
      .getPropertyValue("--fl-topbar-control-h")
      .trim(),
    viewportWidth: roundedNumber(window.innerWidth),
    viewportHeight: roundedNumber(window.innerHeight),
  };
}

function findThumbNode(
  root: HTMLElement | null,
  fileId: string | null,
): HTMLElement | null {
  if (!root || !fileId) {
    return null;
  }
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-thumb-file-id]")).find(
      (node) => node.dataset.thumbFileId === fileId,
    ) ?? null
  );
}

function debugFileListLayout(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isFileListLayoutDebugEnabled()) {
    return;
  }
  devDebug("file-list", `layout ${label}`, data);
}

function debugFolderDnd(label: string, data: Record<string, unknown>): void {
  if (!isFileListFolderDndDebugEnabled()) {
    return;
  }
  devDebug("file-list", `folder-dnd ${label}`, data);
}

export interface FileListProps {
  onOpenFile: (file: {
    id: string;
    kind?: string;
    name?: string;
    absPath?: string | null;
  }) => void;
  onReady?: () => void;
}

type SortKey = "updated_at" | "created_at" | "name";
type FolderDraft =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: ServerFolder };
type FolderContextMenuState = {
  folder: ServerFolder;
  x: number;
  y: number;
} | null;

const ROOT_ID: string | null = null;

type SidebarView = "recent" | "all";

type SceneFilesIntent =
  | { type: "track-recent" }
  | { type: "import"; folderId: string }
  | { type: "import-needs-folder" };

function normalizeStoredFolderId(raw: string | null): string | null {
  if (!raw || raw === "__ALL__") {
    return null;
  }
  return raw;
}

function isSelectedFolderId(
  folderId: string | null | undefined,
  foldersById: Map<string, ServerFolder>,
): folderId is string {
  return typeof folderId === "string" && foldersById.has(folderId);
}

/** 最近 → 无固定目录；本地目录视图 → 仅已选中的具体文件夹。 */
function resolveSidebarTargetFolderId(
  sidebarView: SidebarView,
  currentFolderId: string | null,
  foldersById: Map<string, ServerFolder>,
): string | null {
  if (sidebarView !== "all") {
    return null;
  }
  return isSelectedFolderId(currentFolderId, foldersById)
    ? currentFolderId
    : null;
}

function resolveSceneFilesIntent(
  sidebarView: SidebarView,
  currentFolderId: string | null,
  foldersById: Map<string, ServerFolder>,
  override?: SceneFilesIntent,
): SceneFilesIntent {
  if (override) {
    return override;
  }
  if (
    sidebarView === "all" &&
    isSelectedFolderId(currentFolderId, foldersById)
  ) {
    return { type: "import", folderId: currentFolderId };
  }
  if (sidebarView === "all") {
    return { type: "import-needs-folder" };
  }
  return { type: "track-recent" };
}

function sceneDropOverlayLabel(intent: SceneFilesIntent): string {
  if (intent.type === "track-recent") {
    return "松手打开";
  }
  return "松手导入";
}

const SIDEBAR_VIEW_STORAGE_KEY = "editorhub-filelist-sidebar-view";
/** 开启时仅列出当前文件夹直属文件（不含子文件夹内文件）。 */
const FLAT_FOLDER_VIEW_STORAGE_KEY = "excalidraw-filelist-flat-view";
const FLAT_FOLDER_VIEW_LABEL = "只看直属文件";
/** Desktop 本地目录根视图：开启时仅显示默认数据目录及其子目录中的文件。 */
const DEFAULT_DATA_DIRECTORY_ONLY_STORAGE_KEY =
  "excalidraw-filelist-default-data-dir-only";
const DEFAULT_DATA_DIRECTORY_ONLY_LABEL = "只看默认目录";

const FILELIST_SCENE_IMPORT_INPUT_ID = "filelist-scene-import-input";
const FILE_IMPORT_CONCURRENCY = 3;
/** HTML5 DnD payload for internal folder reparenting / reorder (sidebar only). */
const FOLDER_DND_MIME = "application/x-excalidraw-fork-folder";

function sanitizeFileBaseName(name: string): string {
  const base =
    name.replace(/\.(excalidraw|smm|json|png|svg)$/i, "").trim() || "Imported";
  return base.slice(0, 120);
}

/** 从拖放/多选里筛出可能导入的文档：扩展名 或 典型 MIME。不再「无 type 就全收」，免杂文件进导入。 */
const IMPORTABLE_NAME =
  /\.(excalidraw|excalidrawlib|smm|txt|json|png|svg|jpe?g)$/i;

function takeImportableFilesFromList(fileList: FileList | File[]): File[] {
  return Array.from(fileList).filter(
    (f) =>
      IMPORTABLE_NAME.test(f.name) ||
      f.type === "application/json" ||
      f.type === "application/vnd.simple-mind-map+json" ||
      f.type === "text/plain" ||
      f.type?.startsWith("image/") ||
      f.type === "application/vnd.excalidraw+json" ||
      f.type === "application/x-excalidraw",
  );
}

function filterImportableAbsPaths(absPaths: string[]): string[] {
  return absPaths.filter((absPath) => IMPORTABLE_NAME.test(absPath));
}

/** 多文件导入中途失败时回滚；返回**未能**删除的 id（或网络失败）。 */
async function rollbackCreatedImportFiles(
  createdIds: string[],
): Promise<string[]> {
  const failed: string[] = [];
  for (const id of createdIds) {
    try {
      await ServerSync.deleteFile(id);
      FileSyncState.clearLocalCache(id);
      FileSyncState.clearHashStateForFile(id);
      LocalThumbnailCache.clear(id);
    } catch {
      failed.push(id);
    }
  }
  return failed;
}

function highlightMatch(text: string, q: string): React.ReactNode {
  if (!q.trim()) {
    return text;
  }
  const lower = text.toLowerCase();
  const qi = lower.indexOf(q.toLowerCase());
  if (qi < 0) {
    return text;
  }
  const before = text.slice(0, qi);
  const mid = text.slice(qi, qi + q.length);
  const after = text.slice(qi + q.length);
  return (
    <>
      {before}
      <mark className="filelist__hl">{mid}</mark>
      {after}
    </>
  );
}

function folderParentId(folder: ServerFolder): string | null {
  return folder.parent_id ?? null;
}

/** Mapping roots always render as top-level siblings in the sidebar tree. */
function folderTreeParentId(folder: ServerFolder): string | null {
  if (folder.is_mapping_root) {
    return null;
  }
  return folder.parent_id ?? null;
}

function compareManual(
  a: { sort_index?: number; name: string },
  b: { sort_index?: number; name: string },
) {
  const ai = a.sort_index ?? 0;
  const bi = b.sort_index ?? 0;
  if (ai !== bi) {
    return ai - bi;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function iconPath(
  type:
    | "folder"
    | "file"
    | "grid"
    | "home"
    | "clock"
    | "excalidraw"
    | "mindmap"
    | "chevron"
    | "plus"
    | "upload"
    | "search"
    | "ai"
    | "edit"
    | "download"
    | "delete"
    | "removeRecent"
    | "menu"
    | "sort"
    | "move"
    | "drag"
    | "embed"
    | "settings"
    | "sun"
    | "moon",
) {
  const paths = {
    folder:
      "M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z",
    file: "M6 2h8l4 4v16H6V2zm7 1.5V7h3.5",
    grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
    home: "M12 3l9 8h-2v9h-5v-6h-4v6H5v-9H3l9-8z",
    clock:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm.5 3v5.25l4.25 2.52-.75 1.23-5-2.98V7h1.5z",
    excalidraw:
      "M5 19l4.2-1.1 8.7-8.7a2.1 2.1 0 0 0-3-3L7.2 14.9 5 19zm3.2-2.4l-.9.2.2-.9 7.9-7.9.7.7-7.9 7.9zM4 21h16v-2H4v2z",
    mindmap:
      "M12 4a3 3 0 0 1 2.83 2h3.17a3 3 0 1 1 0 2h-3.17a3 3 0 0 1-1.83 1.83v4.34A3 3 0 1 1 11 14.17V9.83A3 3 0 0 1 12 4zm-5 6a3 3 0 1 1 2.83-4h1.34a3.99 3.99 0 0 0 0 2H9.83A3 3 0 0 1 7 10z",
    chevron: "M9 6l6 6-6 6",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    upload: "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z",
    search:
      "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    ai: "M12 2l1.5 5L18 5l-2 4.5 5 1.5-5 1.5L18 17l-4.5-2L12 20l-1.5-5L6 17l2-4.5L3 11l5-1.5L6 5l4.5 2L12 2z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    delete:
      "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    removeRecent:
      "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    menu: "M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z",
    sort: "M7 4h10v2H7V4zm-3 7h16v2H4v-2zm5 7h6v2H9v-2z",
    drag: "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    move: "M4 12l4-4v3h3v2H8v3l-4-4zM12 7l2 2h7c1.1 0 2 .9 2 2v9H12V7z",
    embed:
      "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
    settings:
      "M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z",
    sun: "M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z",
    moon: "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  };
  return paths[type];
}

function Icon({
  type,
  size = 18,
}: {
  type: Parameters<typeof iconPath>[0];
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" d={iconPath(type)} />
    </svg>
  );
}

function ImageIcon({
  src,
  alt,
  size = 18,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  return (
    <img
      className="filelist__image-icon"
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
    />
  );
}

/**
 * 仅在「按下」和「松手」都点在同一层遮罩上时才关闭，避免在弹层内选区/复制时松手落在外侧误关。
 */
function useStrictOverlayDismiss(onDismiss: () => void) {
  const pointerDownOnBackdrop = useRef(false);
  return useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (e.target === e.currentTarget && pointerDownOnBackdrop.current) {
          onDismiss();
        }
        pointerDownOnBackdrop.current = false;
      },
      onPointerCancel: () => {
        pointerDownOnBackdrop.current = false;
      },
    }),
    [onDismiss],
  );
}

function getDescendantFolderIds(
  folderId: string | null,
  allFolders: ServerFolder[],
): Set<string> {
  const result = new Set<string>();
  const queue: (string | null)[] = [folderId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const f of allFolders) {
      if (folderParentId(f) === parentId && !result.has(f.id)) {
        result.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}

function buildFolderPath(
  folderId: string | null,
  foldersById: Map<string, ServerFolder>,
): ServerFolder[] {
  const path: ServerFolder[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = foldersById.get(current);
    if (!folder) {
      break;
    }
    path.unshift(folder);
    current = folder.parent_id ?? null;
  }
  return path;
}

function expandFolderAncestorIds(
  folderId: string,
  foldersById: Map<string, ServerFolder>,
): Record<string, boolean> {
  return Object.fromEntries(
    buildFolderPath(folderId, foldersById)
      .slice(0, -1)
      .map((folder) => [folder.id, true]),
  );
}

function getInitialFileListStateFromCache(skipCache: boolean): {
  files: ServerFile[];
  folders: ServerFolder[];
  hasCache: boolean;
} {
  if (skipCache) {
    return { files: [], folders: [], hasCache: false };
  }
  const cached = readFileListTreeCache();
  if (!cached) {
    return { files: [], folders: [], hasCache: false };
  }
  return {
    files: cached.files,
    folders: cached.folders,
    hasCache: true,
  };
}

export function useFileListController({ onOpenFile, onReady }: FileListProps) {
  const { shellTheme, toggleShellTheme } = useShellTheme();
  const startupGate = useStartupFileListGate();
  const startupPhase = useStartupPhase();
  const showWebOnlyFileActions = !isDesktopEditorHub();
  const initialList = getInitialFileListStateFromCache(false);
  useEffect(() => {
    purgeLegacyTempArtifacts();
    applyMainSiteDocumentBranding();
    const bootList = getInitialFileListStateFromCache(false);
    traceHomeRenderMount({
      cachedFiles: bootList.files.length,
      cachedFolders: bootList.folders.length,
      hasCache: bootList.hasCache,
      skipInitialCache: false,
    });
    return () => {
      traceIssueDiag("home.render", "unmount", {}, "ok");
    };
  }, []);

  const [files, setFiles] = useState<ServerFile[]>(initialList.files);
  const filesRef = useRef(files);
  filesRef.current = files;
  const [folders, setFolders] = useState<ServerFolder[]>(initialList.folders);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const [currentFolderId, setCurrentFolderIdRaw] = useState<string | null>(
    () => {
      try {
        return normalizeStoredFolderId(
          sessionStorage.getItem("excalidraw-filelist-folder"),
        );
      } catch {
        return null;
      }
    },
  );
  const setCurrentFolderId = useCallback((id: string | null) => {
    setCurrentFolderIdRaw(id);
    try {
      if (id) {
        sessionStorage.setItem("excalidraw-filelist-folder", id);
      } else {
        sessionStorage.removeItem("excalidraw-filelist-folder");
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [sidebarView, setSidebarViewRaw] = useState<SidebarView>(() => {
    try {
      const savedView = sessionStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
      const savedFolder = normalizeStoredFolderId(
        sessionStorage.getItem("excalidraw-filelist-folder"),
      );
      return savedView === "all" && savedFolder ? "all" : "recent";
    } catch {
      return "recent";
    }
  });
  const setSidebarView = useCallback((view: SidebarView) => {
    setSidebarViewRaw(view);
    try {
      sessionStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, []);
  const [recentRevision, setRecentRevision] = useState(0);
  const [recentPathCatalogFiles, setRecentPathCatalogFiles] = useState<
    Record<string, ServerFile>
  >({});
  const [recentPathResolveFailed, setRecentPathResolveFailed] = useState<
    Record<string, true>
  >({});
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  // Move dialog reuses the sidebar tree pattern but with its own expand state so
  // it starts fully collapsed and expands one level at a time (lazy children).
  const [moveDialogExpandedFolders, setMoveDialogExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [allFilesTreeExpanded, setAllFilesTreeExpanded] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [awaitingFirstFetch, setAwaitingFirstFetch] = useState(
    !initialList.hasCache,
  );
  const [error, setError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileDropHoverActive, setFileDropHoverActive] = useState(false);
  const [fetchedThumbs, setFetchedThumbs] = useState<Record<string, string>>(
    {},
  );
  const [, setThumbnailMissRevision] = useState(0);
  const fetchedThumbsRef = useRef(fetchedThumbs);
  fetchedThumbsRef.current = fetchedThumbs;
  const fetchedThumbHashByIdRef = useRef<Record<string, string | null>>({});
  const fileThumbHashByIdRef = useRef<Record<string, string | null>>({});
  const [visibleThumbIds, setVisibleThumbIds] = useState<Set<string>>(
    () => new Set(),
  );
  const prevVisibleThumbIdsRef = useRef<Set<string>>(new Set());
  const sceneImportInputRef = useRef<HTMLInputElement>(null);
  const recentResolvedPathsKeyRef = useRef<string | null>(null);
  const thumbObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbNodeMap = useRef<Map<string, HTMLElement>>(new Map());
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarTreeSelectRef = useRef<{
    folderId: string;
    finish: ReturnType<typeof startIssueDiagTimer>;
  } | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const topbarHeightRef = useRef<number | null>(null);
  const pendingLayoutDebugRef = useRef<{
    label: string;
    data: Record<string, unknown>;
  } | null>(null);
  const topbarFrameTraceFrameRef = useRef<number | null>(null);
  const previousFetchedThumbIdsRef = useRef<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const suppressNextCardOpenRef = useRef<string | null>(null);
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] =
    useState<ServerFolder | null>(null);
  const [folderDeleteBusy, setFolderDeleteBusy] = useState(false);
  const [fileDeleteTarget, setFileDeleteTarget] = useState<ServerFile | null>(
    null,
  );
  const [fileDeleteBusy, setFileDeleteBusy] = useState(false);

  const dismissFolderDeleteDialog = useCallback(() => {
    if (folderDeleteBusy) {
      return;
    }
    setFolderDeleteTarget(null);
  }, [folderDeleteBusy]);
  const dismissFileDeleteDialog = useCallback(() => {
    if (fileDeleteBusy) {
      return;
    }
    setFileDeleteTarget(null);
  }, [fileDeleteBusy]);
  const [folderNameValue, setFolderNameValue] = useState("");
  const [folderContextMenu, setFolderContextMenu] =
    useState<FolderContextMenuState>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const [sortKey, setSortKeyRaw] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem("excalidraw-filelist-sort");
      if (
        saved === "updated_at" ||
        saved === "created_at" ||
        saved === "name"
      ) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return "updated_at";
  });
  const setSortKey = useCallback((key: SortKey) => {
    setSortKeyRaw(key);
    try {
      localStorage.setItem("excalidraw-filelist-sort", key);
    } catch {
      /* ignore */
    }
  }, []);
  const [flatFolderView, setFlatFolderViewRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(FLAT_FOLDER_VIEW_STORAGE_KEY);
      if (saved === "0") {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  });
  const setFlatFolderView = useCallback((flat: boolean) => {
    setFlatFolderViewRaw(flat);
    try {
      localStorage.setItem(FLAT_FOLDER_VIEW_STORAGE_KEY, flat ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const [defaultDataDirectoryOnlyView, setDefaultDataDirectoryOnlyViewRaw] =
    useState(() => {
      try {
        return localStorage.getItem(DEFAULT_DATA_DIRECTORY_ONLY_STORAGE_KEY) === "1";
      } catch {
        return false;
      }
    });
  const setDefaultDataDirectoryOnlyView = useCallback((enabled: boolean) => {
    setDefaultDataDirectoryOnlyViewRaw(enabled);
    try {
      localStorage.setItem(
        DEFAULT_DATA_DIRECTORY_ONLY_STORAGE_KEY,
        enabled ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, []);
  const [defaultDataDirectoryFolderId, setDefaultDataDirectoryFolderId] =
    useState<string | null>(null);
  const defaultDataDirectoryFolderIdRef = useRef<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiDotOk, setAiDotOk] = useState(false);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [formalCreateKind, setFormalCreateKind] = useState<string | null>(null);
  const [formalCreateSaving, setFormalCreateSaving] = useState(false);
  const formalCreateInFlightRef = useRef(false);
  const folderCreateInFlightRef = useRef(false);
  const [importKindDialogOpen, setImportKindDialogOpen] = useState(false);
  const [importKindPlugins, setImportKindPlugins] = useState<EditorPlugin[]>(
    [],
  );
  const [importPickerFileName, setImportPickerFileName] = useState<
    string | null
  >(null);
  const [importFolderPickerOpen, setImportFolderPickerOpen] = useState(false);
  const [importFolderPickerFiles, setImportFolderPickerFiles] = useState<File[]>(
    [],
  );
  const [importFolderPickerTargetId, setImportFolderPickerTargetId] = useState<
    string | null
  >(null);
  const importQueueRef = useRef<File[]>([]);
  const pendingImportFileRef = useRef<File | null>(null);
  const pendingImportFilesRef = useRef<File[]>([]);

  const [moveDialogFile, setMoveDialogFile] = useState<ServerFile | null>(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(
    null,
  );
  const [embedFile, setEmbedFile] = useState<ServerFile | null>(null);
  const [previewFile, setPreviewFile] = useState<ServerFile | null>(null);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [catalogScanNotice, setCatalogScanNotice] = useState<string | null>(
    null,
  );
  const [catalogCapabilities, setCatalogCapabilities] =
    useState<CatalogCapabilities>(
      isDesktopEditorHub()
        ? {
            folderMapping: true,
            addMappedFolder: true,
            archivesEnabled: false,
          }
        : WEB_CATALOG_CAPABILITIES,
    );
  const [sidebarFileDropTargetId, setSidebarFileDropTargetId] = useState<
    string | "__ROOT__" | "__RECENT__" | null
  >(null);

  /** Sidebar: folder reorder / reparent via HTML5 drag (handle only). */
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  type FolderDropInd = {
    targetId: string | "__ROOT__";
    mode: "before" | "after" | "into";
  };
  const [folderDropIndicator, setFolderDropIndicator] =
    useState<FolderDropInd | null>(null);
  const folderDropIndicatorRef = useRef<FolderDropInd | null>(null);
  const folderDndDebugKeyRef = useRef<string | null>(null);
  const setFolderDropInd = useCallback((v: FolderDropInd | null) => {
    folderDropIndicatorRef.current = v;
    setFolderDropIndicator(v);
  }, []);

  const dismissFolderDraft = useCallback(() => setFolderDraft(null), []);
  const dismissNewFileDialog = useCallback(
    () => setNewFileDialogOpen(false),
    [],
  );
  const dismissMoveDialog = useCallback(() => setMoveDialogFile(null), []);
  const dismissMobileTree = useCallback(() => setMobileTreeOpen(false), []);
  const folderDraftOverlayDismiss = useStrictOverlayDismiss(dismissFolderDraft);
  const newFileOverlayDismiss = useStrictOverlayDismiss(dismissNewFileDialog);
  const moveDialogOverlayDismiss = useStrictOverlayDismiss(dismissMoveDialog);
  const mobileTreeBackdropDismiss = useStrictOverlayDismiss(dismissMobileTree);

  useEffect(() => {
    // 一次拖拽保存会在 ~70ms 内连发多个 RECENT_FILES / sync 事件，逐个 setRecentRevision
    // 会触发多次首页重渲染。用 rAF 把同一帧内的多次 bump 归并为一次状态更新，
    // 既保留最终一致性，又避免拖拽期间首页被反复重渲染拖累主线程。
    let rafHandle: number | null = null;
    let coalescedCount = 0;
    let lastReason = "manual";
    const flushBump = () => {
      rafHandle = null;
      const merged = coalescedCount;
      coalescedCount = 0;
      setRecentRevision((value) => {
        const next = value + 1;
        traceIssueDiag(
          "home.render",
          "recentRevision.bump",
          { from: value, to: next, reason: lastReason, coalesced: merged },
          "branch",
        );
        return next;
      });
    };
    const bumpRecent = (event?: Event) => {
      lastReason = event?.type ?? "manual";
      coalescedCount += 1;
      if (rafHandle != null) {
        return;
      }
      if (typeof requestAnimationFrame === "function") {
        rafHandle = requestAnimationFrame(flushBump);
      } else {
        flushBump();
      }
    };
    window.addEventListener(RECENT_FILES_CHANGE_EVENT, bumpRecent);
    window.addEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bumpRecent);
    const unsubCrossTab = onCrossTabFileSaved((fileId, contentSha256, version) => {
      if (contentSha256) {
        patchFileListTreeCacheSavedFile(fileId, {
          content_sha256: contentSha256,
          version: version ?? undefined,
        });
        dispatchFileListIncrementalApply(fileId);
      }
      window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    });
    return () => {
      window.removeEventListener(RECENT_FILES_CHANGE_EVENT, bumpRecent);
      window.removeEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bumpRecent);
      if (rafHandle != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafHandle);
      }
      unsubCrossTab();
    };
  }, []);

  useEffect(() => {
    if (!isDesktopEditorHub()) {
      return undefined;
    }
    const paths = collectRecentAbsPathsFromEntries();
    if (paths.length === 0) {
      devDebug("file-list", "[DEBUG] recent-paths | clear no paths", {
        recentRevision,
      });
      recentResolvedPathsKeyRef.current = null;
      setRecentPathCatalogFiles({});
      setRecentPathResolveFailed({});
      return undefined;
    }
    const pathsKey = fingerprintRecentAbsPaths(paths);
    if (pathsKey === recentResolvedPathsKeyRef.current) {
      devDebug("file-list", "[DEBUG] recent-paths | skip unchanged paths", {
        recentRevision,
        paths: paths.length,
      });
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      devDebug("file-list", "[DEBUG] recent-paths | resolve start", {
        recentRevision,
        paths: paths.length,
      });
      const { resolvedByPath, failures } =
        await resolveRecentPathCatalogByPaths(paths);
      if (cancelled) {
        return;
      }
      const filesById = new Map(filesRef.current.map((file) => [file.id, file]));
      devDebug("file-list", "[DEBUG] recent-paths | apply", {
        recentRevision,
        resolved: Object.keys(resolvedByPath).length,
        failures: Object.keys(failures).length,
      });
      setRecentPathCatalogFiles((prev) =>
        mergeRecentPathCatalogBatch(prev, paths, resolvedByPath, filesById, {
          replaceScope: true,
        }),
      );
      setRecentPathResolveFailed(failures);
      recentResolvedPathsKeyRef.current = pathsKey;
    })();
    return () => {
      cancelled = true;
    };
  }, [recentRevision]);

  useEffect(() => {
    if (!isDesktopEditorHub()) {
      return;
    }
    setRecentPathCatalogFiles((prev) => {
      if (Object.keys(prev).length === 0) {
        return prev;
      }
      const filesById = new Map(files.map((file) => [file.id, file]));
      return mergeRecentPathCatalogFromTree(prev, filesById);
    });
  }, [files]);

  useEffect(() => {
    if (!startupGate.canLoadAiConfig) {
      return;
    }
    const syncAiDot = () => setAiDotOk(isAIConfigured());
    ensureAIConfigLoaded().then(syncAiDot).catch(syncAiDot);
    return subscribeAIConfig(syncAiDot);
  }, [startupGate.canLoadAiConfig]);

  useEffect(() => {
    const nextHashes: Record<string, string | null> = {};
    for (const file of files) {
      nextHashes[file.id] = fileThumbnailCacheKey(file);
    }
    for (const file of Object.values(recentPathCatalogFiles)) {
      nextHashes[file.id] = fileThumbnailCacheKey(file);
    }

    const invalidateReasons: Array<{
      id8: string;
      oldHash: string | null;
      newHash: string | null;
      reason: string;
    }> = [];
    for (const id of Object.keys(fetchedThumbsRef.current)) {
      const oldHash = fetchedThumbHashByIdRef.current[id] ?? null;
      if (!(id in nextHashes)) {
        invalidateReasons.push({
          id8: id8(id) ?? id.slice(0, 8),
          oldHash,
          newHash: null,
          reason: "file-removed-from-tree",
        });
      } else if (oldHash !== nextHashes[id]) {
        invalidateReasons.push({
          id8: id8(id) ?? id.slice(0, 8),
          oldHash,
          newHash: nextHashes[id],
          reason: "content-hash-changed",
        });
      }
    }
    if (invalidateReasons.length > 0) {
      traceThumbHashInvalidate({
        clearedIds8: invalidateReasons.map((r) => r.id8),
        reasons: invalidateReasons,
        filesN: files.length,
      });
    }

    fileThumbHashByIdRef.current = nextHashes;
    pruneThumbnailServerMisses(nextHashes);

    if (
      startupGate.isColdStart &&
      !isStartupPhaseAtLeast(startupPhase, "idle")
    ) {
      return;
    }

    setFetchedThumbs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (
          !(id in nextHashes) ||
          fetchedThumbHashByIdRef.current[id] !== nextHashes[id]
        ) {
          delete next[id];
          delete fetchedThumbHashByIdRef.current[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files, recentPathCatalogFiles, startupGate.isColdStart, startupPhase]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const newIds: string[] = [];
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const fileId = (entry.target as HTMLElement).dataset.thumbFileId;
            if (fileId) {
              newIds.push(fileId);
              // 只停订阅，保留节点在 map 中，确保布局重测仍能命中这些卡片。
              observer.unobserve(entry.target);
            }
          }
        }
        if (newIds.length > 0) {
          setVisibleThumbIds((prev) => {
            const next = new Set(prev);
            for (const id of newIds) next.add(id);
            return next;
          });
        }
      },
      { rootMargin: `${THUMB_VISIBILITY_ROOT_MARGIN_PX}px` },
    );
    thumbObserverRef.current = observer;
    return () => {
      observer.disconnect();
      thumbObserverRef.current = null;
    };
  }, []);

  const syncVisibleThumbIdsFromLayout = useCallback(() => {
    const measured = measureVisibleThumbIdsInRoot(
      mainRef.current,
      thumbNodeMap.current,
    );
    if (measured.size === 0) {
      return;
    }
    setVisibleThumbIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of measured) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const thumbRefCallback = useCallback(
    (node: HTMLElement | null, fileId: string) => {
      if (!node) {
        const prev = thumbNodeMap.current.get(fileId);
        if (prev && thumbObserverRef.current) {
          thumbObserverRef.current.unobserve(prev);
        }
        thumbNodeMap.current.delete(fileId);
        return;
      }
      thumbNodeMap.current.set(fileId, node);
      if (thumbObserverRef.current) {
        thumbObserverRef.current.observe(node);
      }
    },
    [],
  );

  useEffect(() => {
    const bump = () => setSyncVersion((n) => n + 1);
    window.addEventListener("excalidraw-file-sync-state", bump);
    window.addEventListener("excalidraw-server-saved", bump);
    window.addEventListener(LOCAL_THUMB_UPDATED_EVENT, bump);
    window.addEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bump);
    window.addEventListener("storage", bump);
    const unsubscribePending = subscribeNativeThumbnailPending(bump);
    const unsubscribeSavePending = subscribeThumbnailSavePending(bump);
    return () => {
      window.removeEventListener("excalidraw-file-sync-state", bump);
      window.removeEventListener("excalidraw-server-saved", bump);
      window.removeEventListener(LOCAL_THUMB_UPDATED_EVENT, bump);
      window.removeEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bump);
      window.removeEventListener("storage", bump);
      unsubscribePending();
      unsubscribeSavePending();
    };
  }, []);

  const inflightRef = useRef<AbortController | null>(null);
  const inflightPromiseRef = useRef<Promise<FileTreeResponse | undefined> | null>(
    null,
  );
  const refreshSeqRef = useRef(0);
  const catalogListingFingerprintRef = useRef<string | null>(null);
  const latestCatalogTreeRef = useRef<FileTreeResponse | null>(null);
  const currentFolderIdRef = useRef(currentFolderId);
  currentFolderIdRef.current = currentFolderId;
  const sidebarViewRef = useRef(sidebarView);
  sidebarViewRef.current = sidebarView;
  const flatFolderViewRef = useRef(flatFolderView);
  flatFolderViewRef.current = flatFolderView;

  const invalidateInflightRefresh = useCallback(() => {
    refreshSeqRef.current += 1;
    if (inflightRef.current) {
      inflightRef.current.abort();
      inflightRef.current = null;
    }
  }, []);

  const foldersById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const isLocalDirectoryRoot = useMemo(
    () =>
      sidebarView === "all" &&
      !isSelectedFolderId(currentFolderId, foldersById),
    [sidebarView, currentFolderId, foldersById],
  );

  const isFolderUnderMappedRoot = useCallback(
    (folder: ServerFolder): boolean => {
      let current: ServerFolder | undefined = folder;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        if (current.is_mapping_root) {
          return true;
        }
        seen.add(current.id);
        current = current.parent_id
          ? foldersById.get(current.parent_id)
          : undefined;
      }
      return false;
    },
    [foldersById],
  );

  const applyCatalogTree = useCallback((tree: FileTreeResponse): boolean => {
    latestCatalogTreeRef.current = tree;
    const listingFingerprint = fingerprintCatalogListing(tree);
    const scanNotice = deriveCatalogScanNoticeForRuntime(
      tree.scan,
      tree,
      isDesktopEditorHub(),
    );
    const unchanged =
      listingFingerprint === catalogListingFingerprintRef.current;
    traceIssueDiag(
      "home.render",
      unchanged ? "catalogTree.skip" : "catalogTree.apply",
      {
        fingerprint8: listingFingerprint.slice(0, 8),
        prevFingerprint8:
          catalogListingFingerprintRef.current?.slice(0, 8) ?? null,
        folders: tree.folders.length,
        files: tree.files.length,
        scanRunning: tree.scan?.running ?? false,
      },
      unchanged ? "skip" : "ok",
    );
    if (unchanged) {
      setCatalogScanNotice((prev) => (prev === scanNotice ? prev : scanNotice));
      traceResourceOp("filelist", "applyCatalogTree", "skip", {
        reason: "listing-fingerprint-unchanged",
      });
      return false;
    }
    catalogListingFingerprintRef.current = listingFingerprint;
    const mergedTree = mergeFileListTreeWithSessionCachePatches(tree);
    setFolders(mergedTree.folders);
    setFiles(mergedTree.files);
    if (isDebugRuntimeEnabled()) {
      for (const merged of mergedTree.files) {
        const server = tree.files.find((file) => file.id === merged.id);
        if (!server || server.updated_at === merged.updated_at) {
          continue;
        }
        traceFileListSortOrder("catalog.merge", {
          fileId8: merged.id.slice(0, 8),
          serverUpdatedAt: server.updated_at,
          mergedUpdatedAt: merged.updated_at,
        });
      }
    }
    traceResourceOp("filelist", "applyCatalogTree", "ok", {
      folders: tree.folders.length,
      files: tree.files.length,
      scanRunning: tree.scan?.running ?? false,
    });
    traceTreeStateApply({
      folders: tree.folders.length,
      files: tree.files.length,
      scanRunning: tree.scan?.running ?? false,
    });
    setCatalogCapabilities(resolveRuntimeCatalogCapabilities(tree.capabilities));
    setCatalogScanNotice(scanNotice);
    setExpandedFolders((prev) => mergeExpandedFolderState(prev, tree.folders));
    for (const f of tree.files) {
      if (f.content_sha256) {
        FileSyncState.setServerHash(f.id, f.content_sha256);
      }
      if (
        FileSyncState.getSyncState(f.id) === "draft" &&
        !FileSyncState.getLocalEditTime(f.id)
      ) {
        logList.debug(`clearing stale draft hash for ${f.id.slice(0, 8)}`);
        FileSyncState.clearHashStateForFile(f.id);
      }
    }
    writeFileListTreeCache(mergedTree);
    return true;
  }, []);

  const refresh = useCallback(
    async (options?: {
      silent?: boolean;
      noErrorOnFailure?: boolean;
    }): Promise<FileTreeResponse | undefined> => {
      if (inflightRef.current) {
        if (options?.silent && inflightPromiseRef.current) {
          devDebug("file-list", "[DEBUG] refresh | coalesce silent inflight", {
            silent: true,
          });
          return inflightPromiseRef.current;
        }
        devDebug("file-list", "[DEBUG] refresh | abort previous", {
          nextSeq: refreshSeqRef.current + 1,
          silent: !!options?.silent,
        });
        inflightRef.current.abort();
      }
      const seq = ++refreshSeqRef.current;
      const ac = new AbortController();
      inflightRef.current = ac;
      const promise = (async (): Promise<FileTreeResponse | undefined> => {
      try {
        if (!options?.silent) {
          setLoading(true);
        }
        logList.debug("refresh start");
        traceResourceOp("filelist", "refresh", "start", {
          seq,
          silent: !!options?.silent,
        });
        devDebug("file-list", "[DEBUG] refresh | start", {
          seq,
          silent: !!options?.silent,
          noErrorOnFailure: !!options?.noErrorOnFailure,
          currentFolderId: currentFolderIdRef.current,
        });
        const tree = await ServerSync.listFileTree({ signal: ac.signal });
        if (ac.signal.aborted || seq !== refreshSeqRef.current) {
          devDebug("file-list", "[DEBUG] refresh | ignored stale result", {
            seq,
            currentSeq: refreshSeqRef.current,
            aborted: ac.signal.aborted,
            tree: summarizeFileListTreeForDebug(tree),
          });
          return;
        }
        const listingFingerprint = fingerprintCatalogListing(tree);
        latestCatalogTreeRef.current = tree;
        const scanNotice = deriveCatalogScanNoticeForRuntime(
          tree.scan,
          tree,
          isDesktopEditorHub(),
        );
        if (listingFingerprint === catalogListingFingerprintRef.current) {
          traceIssueDiag(
            "home.render",
            "refresh.skip_unchanged",
            {
              seq,
              fingerprint8: listingFingerprint.slice(0, 8),
              scanNotice,
            },
            "skip",
          );
          devDebug("file-list", "[DEBUG] refresh | skip unchanged listing", {
            seq,
            listingFingerprint,
            scanNotice,
            tree: summarizeFileListTreeForDebug(tree),
          });
          setCatalogScanNotice((prev) =>
            prev === scanNotice ? prev : scanNotice,
          );
          logList.debug("refresh skipped apply (listing unchanged)");
          traceResourceOp("filelist", "refresh", "skip", {
            seq,
            reason: "listing-unchanged",
            elapsedMs: undefined,
          });
          onReady?.();
          return tree;
        }
        devDebug("file-list", "[DEBUG] refresh | apply tree", {
          seq,
          listingFingerprint,
          tree: summarizeFileListTreeForDebug(tree),
          currentFolderId: currentFolderIdRef.current,
          currentFolderStillExists: currentFolderIdRef.current
            ? tree.folders.some((folder) => folder.id === currentFolderIdRef.current)
            : true,
        });
        traceIssueDiag(
          "home.render",
          "refresh.apply",
          {
            seq,
            fingerprint8: listingFingerprint.slice(0, 8),
            folders: tree.folders.length,
            files: tree.files.length,
            scanRunning: tree.scan?.running ?? false,
          },
          "ok",
        );
        const commitTree = () => {
          if (seq !== refreshSeqRef.current) {
            return;
          }
          applyCatalogTree(tree);
          traceResourceOp("filelist", "refresh", "ok", {
            seq,
            folders: tree.folders.length,
            files: tree.files.length,
            scanRunning: tree.scan?.running ?? false,
          });
          // Use ref to read latest currentFolderId without it being a dep,
          // preventing unwanted re-fetches when folder navigation triggers a
          // setCurrentFolderId here (which would create a dep-change loop).
          const fid = currentFolderIdRef.current;
          if (fid && !tree.folders.some((f) => f.id === fid)) {
            devDebug("file-list", "[DEBUG] refresh | current folder missing", {
              seq,
              missingFolderId: fid,
              tree: summarizeFileListTreeForDebug(tree),
            });
            setSidebarView("recent");
            setCurrentFolderId(null);
          }
          logList.debug("refresh done", {
            folders: tree.folders.length,
            count: tree.files.length,
            withThumb: tree.files.filter((x) => x.has_thumbnail).length,
            withSha: tree.files.filter((x) => x.content_sha256).length,
          });
          setError(null);
          setImportNotice(null);
          onReady?.();
        };
        if (shouldDeferHeavyHostWorkForExcalidraw()) {
          traceResourceOp("filelist", "refresh", "defer", {
            reason: "excalidraw-host-cooldown",
            seq,
          });
          runAfterExcalidrawPointerDrag(commitTree);
          return tree;
        }
        commitTree();
        return tree;
      } catch (e: any) {
        if (ac.signal.aborted || seq !== refreshSeqRef.current) {
          traceResourceOp("filelist", "refresh", "skip", {
            seq,
            reason: ac.signal.aborted ? "aborted" : "stale-seq",
          });
          devDebug("file-list", "[DEBUG] refresh | ignored error", {
            seq,
            currentSeq: refreshSeqRef.current,
            aborted: ac.signal.aborted,
            message: e?.message ?? String(e),
          });
          return undefined;
        }
        logList.debug("refresh error", e);
        traceResourceOp("filelist", "refresh", "fail", {
          seq,
          message: e?.message ?? String(e),
        });
        if (options?.noErrorOnFailure) {
          onReady?.();
          throw e;
        }
        setError(e.message || "Failed to load files");
        onReady?.();
        return undefined;
      } finally {
        // Always reset loading for non-silent requests, even if the request was
        // aborted mid-flight — otherwise loading stays stuck at true when an
        // in-progress refresh is cancelled by an excalidraw-file-list-refresh event.
        if (!options?.silent) {
          setLoading(false);
        }
        if (inflightRef.current === ac) {
          inflightRef.current = null;
        }
        if (inflightPromiseRef.current === promise) {
          inflightPromiseRef.current = null;
        }
      }
      })();
      inflightPromiseRef.current = promise;
      return promise;
    },
    [applyCatalogTree, onReady],
  );

  const runSilentRefresh = useCallback(() => {
    if (shouldDeferHeavyHostWorkForExcalidraw()) {
      traceResourceOp("filelist", "refresh", "defer", {
        reason: isExcalidrawPointerDragActive()
          ? "excalidraw-pointer-drag"
          : "excalidraw-host-cooldown",
      });
      if (isDebugRuntimeEnabled()) {
        traceFileListSortOrder("refresh.defer", {
          reason: "excalidraw-pointer-drag",
        });
      }
      devDebug(
        "file-list",
        "[DEBUG] refresh | defer until excalidraw pointer drag ends",
      );
      runAfterExcalidrawPointerDrag(runSilentRefresh);
      return;
    }
    if (shouldSkipSilentTreeRefreshAfterIncrementalSave()) {
      traceResourceOp("filelist", "refresh", "skip", {
        reason: "incremental-save-window",
      });
      devDebug("file-list", "[DEBUG] refresh | skip incremental-save window");
      return;
    }
    logList.debug("excalidraw-file-list-refresh -> refresh(silent)");
    void refresh({ silent: true, noErrorOnFailure: true });
  }, [refresh]);

  const scheduleSilentRefresh = useCallback(() => {
    if (startupGate.isColdStart && !startupGate.canRefreshTree) {
      return;
    }
    scheduleDebouncedFileListRefresh(runSilentRefresh);
  }, [
    runSilentRefresh,
    startupGate.canRefreshTree,
    startupGate.isColdStart,
  ]);

  useEffect(() => {
    const onListRefresh = () => scheduleSilentRefresh();
    window.addEventListener("excalidraw-file-list-refresh", onListRefresh);
    return () => {
      window.removeEventListener("excalidraw-file-list-refresh", onListRefresh);
      cancelDebouncedFileListRefresh();
    };
  }, [scheduleSilentRefresh]);

  useEffect(() => {
    if (!folderContextMenu) {
      return undefined;
    }
    const close = () => {
      setFolderContextMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [folderContextMenu]);

  useEffect(() => {
    if (!importNotice) {
      return;
    }
    const timer = window.setTimeout(() => setImportNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [importNotice]);

  const startupTreeLoadDoneRef = useRef(false);

  const runStartupTreeLoad = useCallback(async () => {
    if (startupTreeLoadDoneRef.current) {
      notifyStartupHomeTreeReady();
      return;
    }
    startupTreeLoadDoneRef.current = true;
    await refresh({ silent: true });
    setAwaitingFirstFetch(false);
    notifyStartupHomeTreeReady();
  }, [refresh]);

  useRegisterStartupHomeTreeLoader(runStartupTreeLoad);

  useEffect(() => {
    const onLoadTree = () => {
      void runStartupTreeLoad();
    };
    window.addEventListener(STARTUP_LOAD_HOME_TREE_EVENT, onLoadTree);
    return () => {
      window.removeEventListener(STARTUP_LOAD_HOME_TREE_EVENT, onLoadTree);
    };
  }, [runStartupTreeLoad]);

  useEffect(() => {
    if (!isDesktopEditorHub() || !catalogCapabilities.folderMapping) {
      return;
    }
    return ServerSync.subscribeCatalogChanges(() => {
      scheduleSilentRefresh();
    });
  }, [catalogCapabilities.folderMapping, scheduleSilentRefresh]);

  useEffect(() => {
    if (
      !isDesktopEditorHub() ||
      !catalogCapabilities.folderMapping ||
      !catalogScanNotice
    ) {
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      void ServerSync.getCatalogScanStatus()
        .then((scan) => {
          if (cancelled) {
            return;
          }
          const notice = deriveCatalogScanNoticeForRuntime(
            scan,
            latestCatalogTreeRef.current,
            true,
          );
          setCatalogScanNotice(notice);
          if (notice) {
            timer = setTimeout(poll, 2500);
          }
        })
        .catch(() => {
          if (!cancelled) {
            timer = setTimeout(poll, 4000);
          }
        });
    };
    timer = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [catalogCapabilities.folderMapping, catalogScanNotice]);

  const currentPath = useMemo(
    () => buildFolderPath(currentFolderId, foldersById),
    [currentFolderId, foldersById],
  );

  const draftStateById = useMemo(() => {
    const slotFor = (file: ServerFile) => buildThumbnailDraftSlot(file);
    const byId: Record<string, ReturnType<typeof slotFor>> = {};
    for (const f of files) {
      byId[f.id] = slotFor(f);
    }
    for (const draft of LocalDraftSessions.listIndexed()) {
      if (!byId[draft.id]) {
        byId[draft.id] = slotFor(draftSessionToServerFile(draft));
      }
    }
    return byId;
  }, [files, syncVersion]);

  const effectiveUpdatedAt = useCallback((f: ServerFile): string => {
    return resolveListSortUpdatedAt(
      f.id,
      f.updated_at,
      FileSyncState.getLocalEditTime(f.id),
    );
  }, []);

  const descendantFolderIds = useMemo(
    () => getDescendantFolderIds(currentFolderId, folders),
    [currentFolderId, folders],
  );

  const isBrowsingSubfolder = useMemo(
    () => isSelectedFolderId(currentFolderId, foldersById),
    [currentFolderId, foldersById],
  );

  const defaultDataDirectoryDescendantIds = useMemo(
    () => getDescendantFolderIds(defaultDataDirectoryFolderId, folders),
    [defaultDataDirectoryFolderId, folders],
  );

  const filesById = useMemo(() => {
    const map = new Map<string, ServerFile>();
    for (const file of files) {
      map.set(file.id, file);
    }
    for (const draft of LocalDraftSessions.listIndexed()) {
      map.set(draft.id, draftSessionToServerFile(draft));
    }
    return map;
  }, [files, recentRevision]);

  const recentCatalogFileIdToAbsPath = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [absPath, file] of Object.entries(recentPathCatalogFiles)) {
      map[file.id] = absPath;
    }
    return map;
  }, [recentPathCatalogFiles]);

  const handleOpenFile = useCallback(
    (opts: { id: string; kind: string }) => {
      const file = filesById.get(opts.id);
      traceFileOpen("clickCard", {
        fileId8: id8(opts.id),
        kind: opts.kind,
        name: file?.name ?? null,
        syncState: file ? readFileDraftStatus(opts.id) : null,
        corrupt: file ? isCorruptCatalogFile(file) : false,
      });
      devDebug("app", "handleOpenFile", {
        id8: opts.id.slice(0, 20),
        kind: opts.kind,
      });
      if (isCorruptCatalogFile(file)) {
        touchRecentOpenedFile({
          fileId: opts.id,
          absPath: recentCatalogFileIdToAbsPath[opts.id] ?? null,
        });
        traceFileOpen("clickCard", { fileId8: id8(opts.id), reason: "corrupt-preview" }, "branch");
        if (file) {
          setPreviewFile(file);
        }
        return;
      }
      traceFileOpen("clickCard", { fileId8: id8(opts.id), kind: opts.kind }, "ok");
      onOpenFile({
        ...opts,
        name: file?.name,
        absPath: recentCatalogFileIdToAbsPath[opts.id] ?? null,
      });
    },
    [filesById, onOpenFile, recentCatalogFileIdToAbsPath],
  );

  const openTrackedCatalogFile = useCallback(
    (file: ServerFile, absPath?: string | null) => {
      traceFileOpen("openTrackedPath", {
        fileId8: id8(file.id),
        kind: file.kind,
        name: file.name,
        corrupt: isCorruptCatalogFile(file),
      });
      if (isCorruptCatalogFile(file)) {
        setPreviewFile(file);
        return;
      }
      onOpenFile({
        id: file.id,
        kind: editorRegistry.resolveKind(file.kind),
        name: file.name,
        absPath: absPath ?? recentCatalogFileIdToAbsPath[file.id] ?? null,
      });
    },
    [onOpenFile, recentCatalogFileIdToAbsPath],
  );

  const recentDisplayFiles = useMemo(() => {
    const resolved: ServerFile[] = [];
    const seenIds = new Set<string>();
    const resolveCtx = {
      filesById,
      recentPathCatalogFiles,
      pathByFileId: recentCatalogFileIdToAbsPath,
    };
    for (const entry of getRecentFileEntries()) {
      let file: ServerFile | null = null;
      if (isRecentPathEntry(entry.id)) {
        const absPath = getRecentPathFromEntryId(entry.id);
        file = absPath
          ? findRecentPathCatalogFile(recentPathCatalogFiles, absPath)?.file ??
            findCatalogFileByAbsPath(
              absPath,
              filesById,
              recentCatalogFileIdToAbsPath,
            ) ??
            null
          : null;
      } else if (isLocalDraftFileId(entry.id)) {
        file =
          filesById.get(entry.id) ??
          (LocalDraftSessions.get(entry.id)
            ? draftSessionToServerFile(LocalDraftSessions.get(entry.id)!)
            : null);
      } else {
        const resolvedId = resolveRecentEntryToFileId(entry, resolveCtx);
        if (resolvedId) {
          file = filesById.get(resolvedId) ?? null;
          if (!file) {
            const absPath =
              getRecentPathForFileId(resolvedId) ??
              recentCatalogFileIdToAbsPath[resolvedId] ??
              null;
            file = absPath
              ? findRecentPathCatalogFile(recentPathCatalogFiles, absPath)?.file ??
                findCatalogFileByAbsPath(
                  absPath,
                  filesById,
                  recentCatalogFileIdToAbsPath,
                ) ??
                null
              : null;
          }
        }
      }
      if (file && !seenIds.has(file.id)) {
        seenIds.add(file.id);
        resolved.push(file);
      }
    }
    return resolved;
  }, [filesById, recentCatalogFileIdToAbsPath, recentPathCatalogFiles, recentRevision]);

  useEffect(() => {
    traceHomeRenderPaint("recentDisplayFiles", {
      count: recentDisplayFiles.length,
      recentRevision,
      recentEntryCount: getRecentFileEntries().length,
    });
  }, [recentDisplayFiles, recentRevision]);

  const filteredFiles = useMemo(() => {
    let list =
      sidebarView === "recent" && !searchQuery.trim()
        ? recentDisplayFiles
        : files;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const searchPool =
        sidebarView === "recent"
          ? [
              ...recentDisplayFiles,
              ...files.filter((f) => !isLocalDraftFileId(f.id)),
            ]
          : sidebarView === "all"
          ? files.filter((f) => !isLocalDraftFileId(f.id))
          : files;
      const seen = new Set<string>();
      list = [];
      for (const f of searchPool) {
        if (seen.has(f.id) || !f.name.toLowerCase().includes(q)) {
          continue;
        }
        seen.add(f.id);
        list.push(f);
      }
    } else if (sidebarView === "all") {
      list = files.filter((f) => {
        if (isLocalDraftFileId(f.id)) {
          return false;
        }
        const fid = f.folder_id ?? null;
        if (isLocalDirectoryRoot) {
          if (isDesktopEditorHub()) {
            if (!defaultDataDirectoryOnlyView) {
              return true;
            }
            if (!defaultDataDirectoryFolderId) {
              return false;
            }
            return (
              fid === defaultDataDirectoryFolderId ||
              defaultDataDirectoryDescendantIds.has(fid as string)
            );
          }
          if (flatFolderView) {
            return fid === currentFolderId;
          }
          return true;
        }
        if (flatFolderView) {
          return fid === currentFolderId;
        }
        return (
          fid === currentFolderId || descendantFolderIds.has(fid as string)
        );
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
        });
      }
      if (sortKey === "created_at") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      return (
        new Date(effectiveUpdatedAt(b)).getTime() -
        new Date(effectiveUpdatedAt(a)).getTime()
      );
    });
    return sorted;
  }, [
    currentFolderId,
    defaultDataDirectoryDescendantIds,
    defaultDataDirectoryFolderId,
    defaultDataDirectoryOnlyView,
    descendantFolderIds,
    effectiveUpdatedAt,
    files,
    flatFolderView,
    foldersById,
    isLocalDirectoryRoot,
    recentDisplayFiles,
    searchQuery,
    sidebarView,
    sortKey,
    syncVersion,
  ]);

  const showNewEntryCard = useMemo(
    () =>
      !searchQuery.trim() &&
      (sidebarView === "recent" ||
        isLocalDirectoryRoot ||
        isSelectedFolderId(currentFolderId, foldersById)),
    [
      currentFolderId,
      foldersById,
      isLocalDirectoryRoot,
      searchQuery,
      sidebarView,
    ],
  );

  const fileListSortPosRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!isDebugRuntimeEnabled() || sortKey === "name") {
      return;
    }
    const prev = fileListSortPosRef.current;
    const next = new Map<string, number>();
    for (let index = 0; index < filteredFiles.length; index += 1) {
      const file = filteredFiles[index];
      next.set(file.id, index);
      const fileId = file.id;
      const prevIndex = prev.get(fileId);
      if (prevIndex === index) {
        continue;
      }
      const localEdit = FileSyncState.getLocalEditTime(fileId);
      const hasDraft = FileSyncState.hasUnsavedChanges(fileId);
      if (!localEdit && !hasDraft && prevIndex == null) {
        continue;
      }
      traceFileListSortOrder("position.change", {
        fileId8: fileId.slice(0, 8),
        prevIndex: prevIndex ?? null,
        nextIndex: index,
        sortKey,
        localEditTime: localEdit,
        serverUpdatedAt: file.updated_at,
        effectiveUpdatedAt: effectiveUpdatedAt(file),
        hasDraft,
        syncVersion,
      });
    }
    fileListSortPosRef.current = next;
  }, [effectiveUpdatedAt, filteredFiles, sortKey, syncVersion]);

  useEffect(() => {
    traceHomeRenderPaint("loading", {
      loading,
      awaitingFirstFetch,
      files: files.length,
      folders: folders.length,
      sidebarView,
      recentRevision,
      filteredFiles: filteredFiles.length,
    });
  }, [
    awaitingFirstFetch,
    loading,
    files.length,
    folders.length,
    sidebarView,
    recentRevision,
    filteredFiles.length,
  ]);

  useEffect(() => {
    const pending = sidebarTreeSelectRef.current;
    if (!pending || pending.folderId !== currentFolderId) {
      return;
    }
    pending.finish({
      folderId8: currentFolderId.slice(0, 8),
      sidebarView,
      filteredFiles: filteredFiles.length,
      visibleThumbs: visibleThumbIds.size,
    });
    sidebarTreeSelectRef.current = null;
  }, [currentFolderId, sidebarView, filteredFiles.length, visibleThumbIds.size]);

  useEffect(() => {
    traceHomeRenderPaint("visibleThumbs", {
      count: visibleThumbIds.size,
      sidebarView,
      filteredFiles: filteredFiles.length,
    });
  }, [visibleThumbIds.size, sidebarView, filteredFiles.length]);

  const collectLayoutDebugData = useCallback(
    (data: Record<string, unknown> = {}) => {
      const sidebar = sidebarRef.current;
      const titlebar = document.querySelector(".desktop-titlebar");
      const appShell = document.querySelector(".app-shell--desktop");
      const appShellBody = document.querySelector(".app-shell--desktop__body");
      const workspace = topbarRef.current?.closest(".filelist__workspace") ?? null;
      const main = mainRef.current;
      const grid = gridRef.current;
      const rootRow = sidebar?.querySelector(".filelist__tree-root") ?? null;
      const activeRow =
        sidebar?.querySelector(
          ".filelist__tree-root--active, .filelist__tree-row--active",
        ) ?? null;
      const firstCard = grid?.querySelector(".filelist__card") ?? null;
      const firstThumbId =
        typeof data.firstThumbId === "string" ? data.firstThumbId : null;
      const firstThumb = findThumbNode(grid, firstThumbId);

      return {
        currentFolderId: currentFolderIdRef.current ?? "__ROOT__",
        currentFolderName: currentFolderIdRef.current
          ? foldersById.get(currentFolderIdRef.current)?.name ?? null
          : "本地目录",
        sidebarView: sidebarViewRef.current,
        flatFolderView: flatFolderViewRef.current,
        files: files.length,
        filteredFiles: filteredFiles.length,
        fetchedThumbs: Object.keys(fetchedThumbsRef.current).length,
        topbarLayout: collectTopbarLayoutDebug(topbarRef.current),
        desktopTitlebar: computedLayoutInfo(titlebar),
        appShell: computedLayoutInfo(appShell),
        appShellBody: computedLayoutInfo(appShellBody),
        workspace: computedLayoutInfo(workspace),
        sidebar: computedLayoutInfo(sidebar),
        main: computedLayoutInfo(main),
        grid: computedLayoutInfo(grid),
        rootRow: computedLayoutInfo(rootRow),
        activeRow: computedLayoutInfo(activeRow),
        firstCard: computedLayoutInfo(firstCard),
        firstThumb: computedLayoutInfo(firstThumb),
        ...data,
      };
    },
    [files.length, filteredFiles.length, foldersById],
  );

  useLayoutEffect(() => {
    const pending = pendingLayoutDebugRef.current;
    if (!pending) {
      return;
    }
    pendingLayoutDebugRef.current = null;
    debugFileListLayout(pending.label, collectLayoutDebugData(pending.data));
    const raf = window.requestAnimationFrame(() => {
      debugFileListLayout(
        `${pending.label} next frame`,
        collectLayoutDebugData(pending.data),
      );
    });
    return () => window.cancelAnimationFrame(raf);
  });

  useEffect(() => {
    return () => {
      if (topbarFrameTraceFrameRef.current !== null) {
        window.cancelAnimationFrame(topbarFrameTraceFrameRef.current);
        topbarFrameTraceFrameRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const currentIds = Object.keys(fetchedThumbs);
    const previousIds = previousFetchedThumbIdsRef.current;
    const newThumbIds = currentIds.filter((id) => !previousIds.has(id));
    previousFetchedThumbIdsRef.current = new Set(currentIds);

    if (!isFileListLayoutDebugEnabled() || newThumbIds.length === 0) {
      return;
    }

    const data = {
      firstThumbId: newThumbIds[0],
      newThumbCount: newThumbIds.length,
      newThumbIds: newThumbIds.slice(0, 8).map((id) => id.slice(0, 8)),
    };
    debugFileListLayout(
      "thumbnail committed layout",
      collectLayoutDebugData(data),
    );
    const raf = window.requestAnimationFrame(() => {
      debugFileListLayout(
        "thumbnail next frame layout",
        collectLayoutDebugData(data),
      );
    });
    return () => window.cancelAnimationFrame(raf);
  }, [collectLayoutDebugData, fetchedThumbs]);

  const setFetchedThumbsWithLayoutDebug = useCallback(
    (nextState: React.SetStateAction<Record<string, string>>) => {
      setFetchedThumbs((prev) => {
        const next =
          typeof nextState === "function" ? nextState(prev) : nextState;
        const prevIds = new Set(Object.keys(prev));
        const nextIds = Object.keys(next);
        const added = nextIds.filter((id) => !prevIds.has(id));
        const removed = [...prevIds].filter((id) => !(id in next));

        if (added.length > 0 || removed.length > 0) {
          traceThumbFetchedStateApply({
            addedIds8: added.map((id) => id8(id) ?? id.slice(0, 8)),
            removedIds8: removed.map((id) => id8(id) ?? id.slice(0, 8)),
            prevN: prevIds.size,
            nextN: nextIds.length,
            source: "setFetchedThumbs",
          });
        }

        if (isFileListLayoutDebugEnabled() && added.length > 0) {
          debugFileListLayout(
            "before thumbnail state update",
            collectLayoutDebugData({
              firstThumbId: added[0],
              newThumbCount: added.length,
              newThumbIds: added.slice(0, 8).map((id) => id.slice(0, 8)),
              previousFetchedThumbs: prevIds.size,
              nextFetchedThumbs: nextIds.length,
            }),
          );
        }

        return next;
      });
    },
    [collectLayoutDebugData],
  );

  const queueTopbarLayoutDebug = useCallback(
    (label: string, data: Record<string, unknown> = {}) => {
      if (!isFileListLayoutDebugEnabled()) {
        return;
      }
      pendingLayoutDebugRef.current = { label, data };
    },
    [],
  );

  const traceTopbarLayoutFrames = useCallback(
    (label: string, data: Record<string, unknown> = {}) => {
      if (!isFileListLayoutDebugEnabled()) {
        return;
      }
      if (topbarFrameTraceFrameRef.current !== null) {
        window.cancelAnimationFrame(topbarFrameTraceFrameRef.current);
        topbarFrameTraceFrameRef.current = null;
      }

      const maxFrames = 10;
      let frame = 0;
      let previous = collectLayoutDebugData({
        ...data,
        frameIndex: frame,
        traceLabel: label,
      });
      debugFileListLayout(`${label} topbar frame trace start`, previous);

      const tick = () => {
        frame += 1;
        const current = collectLayoutDebugData({
          ...data,
          frameIndex: frame,
          traceLabel: label,
        });
        const previousTopbar =
          (previous.topbarLayout as { topbar?: Record<string, unknown> } | null)
            ?.topbar ?? null;
        const currentTopbar =
          (current.topbarLayout as { topbar?: Record<string, unknown> } | null)
            ?.topbar ?? null;
        const topbarDelta = layoutFrameDelta(previousTopbar, currentTopbar);
        const bodyDelta = layoutFrameDelta(
          previous.appShellBody as Record<string, unknown> | null,
          current.appShellBody as Record<string, unknown> | null,
        );
        const workspaceDelta = layoutFrameDelta(
          previous.workspace as Record<string, unknown> | null,
          current.workspace as Record<string, unknown> | null,
        );

        if (
          Object.keys(topbarDelta).length > 0 ||
          Object.keys(bodyDelta).length > 0 ||
          Object.keys(workspaceDelta).length > 0
        ) {
          debugFileListLayout("topbar frame changed", {
            ...current,
            previousTopbar,
            topbarDelta,
            bodyDelta,
            workspaceDelta,
          });
        }

        previous = current;
        if (frame < maxFrames) {
          topbarFrameTraceFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        topbarFrameTraceFrameRef.current = null;
        debugFileListLayout("topbar frame trace end", current);
      };

      topbarFrameTraceFrameRef.current = window.requestAnimationFrame(tick);
    },
    [collectLayoutDebugData],
  );

  useLayoutEffect(() => {
    if (!isFileListLayoutDebugEnabled()) {
      return;
    }
    const data = {
      trigger: "navigation-state",
      sidebarView,
      currentFolderId: currentFolderId ?? "__ROOT__",
      breadcrumbSegments: currentPath.length,
      breadcrumbLabels: currentPath.map((folder) => folder.name),
      flatFolderView,
      hasError: Boolean(error),
      hasImportNotice: Boolean(importNotice),
    };
    debugFileListLayout(
      "topbar navigation state commit",
      collectLayoutDebugData(data),
    );
    traceTopbarLayoutFrames("topbar navigation state", data);
    const raf = window.requestAnimationFrame(() => {
      debugFileListLayout(
        "topbar navigation state next frame",
        collectLayoutDebugData(data),
      );
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    collectLayoutDebugData,
    currentFolderId,
    currentPath,
    error,
    flatFolderView,
    importNotice,
    sidebarView,
    traceTopbarLayoutFrames,
  ]);

  useLayoutEffect(() => {
    if (!isFileListLayoutDebugEnabled()) {
      return;
    }
    const topbar = topbarRef.current;
    if (!topbar) {
      return;
    }

    topbarHeightRef.current = topbar.getBoundingClientRect().height;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextHeight = entry.contentRect.height;
        const previousHeight = topbarHeightRef.current;
        if (
          previousHeight == null ||
          Math.abs(nextHeight - previousHeight) <= 0.5
        ) {
          topbarHeightRef.current = nextHeight;
          continue;
        }
        debugFileListLayout(
          "topbar height changed",
          collectLayoutDebugData({
            trigger: "ResizeObserver",
            previousHeight: roundedNumber(previousHeight),
            nextHeight: roundedNumber(nextHeight),
            delta: roundedNumber(nextHeight - previousHeight),
            sidebarView: sidebarViewRef.current,
            currentFolderId: currentFolderIdRef.current ?? "__ROOT__",
            flatFolderView: flatFolderViewRef.current,
          }),
        );
        topbarHeightRef.current = nextHeight;
      }
    });
    observer.observe(topbar);
    return () => observer.disconnect();
  }, [collectLayoutDebugData, currentFolderId, sidebarView]);

  /**
   * 当前视图内的文件均参与缩略图拉取/生成，包括嵌套子文件夹中的文件。
   * thumbCoverage：可见 id 即拉取准入，无 off-screen prefetch。
   */
  const thumbLoadScopeFiles = useMemo(() => filteredFiles, [filteredFiles]);

  /**
   * 缩略图拉取/UI loading 均只对可见卡片（layout 同步 + IntersectionObserver）。
   */
  const thumbFetchAllowIds = useMemo(
    () => computeThumbFetchAllowIds(visibleThumbIds),
    [visibleThumbIds],
  );

  useEffect(() => {
    const prev = prevVisibleThumbIdsRef.current;
    const added = [...visibleThumbIds].filter((id) => !prev.has(id));
    const removed = [...prev].filter((id) => !visibleThumbIds.has(id));
    if (added.length > 0 || removed.length > 0) {
      traceThumbFetchAllowChange({
        visibleN: visibleThumbIds.size,
        allowN: thumbFetchAllowIds.size,
        scopeN: thumbLoadScopeFiles.length,
        addedVisible8: added.map((id) => id8(id) ?? id.slice(0, 8)),
        removedVisible8: removed.map((id) => id8(id) ?? id.slice(0, 8)),
        allowDelta: thumbFetchAllowIds.size - prev.size,
      });
    }
    prevVisibleThumbIdsRef.current = new Set(visibleThumbIds);
  }, [visibleThumbIds, thumbFetchAllowIds, thumbLoadScopeFiles]);

  const onThumbnailServerMiss = useCallback(() => {
    setThumbnailMissRevision((revision) => revision + 1);
  }, []);

  const { thumbFetchingRef } = useThumbnailPipeline({
    thumbLoadScopeFiles,
    thumbFetchAllowIds,
    draftStateById,
    fetchedThumbSvgByIdRef: fetchedThumbsRef,
    fetchedThumbHashByIdRef,
    fileThumbHashByIdRef,
    setFetchedThumbs: setFetchedThumbsWithLayoutDebug,
    onThumbnailServerMiss,
    serialFetch: startupGate.isColdStart,
    fetchEnabled: startupGate.canFetchThumbnails,
  });

  const clearFetchedThumbForFile = useCallback((fileId: string) => {
    clearThumbnailServerMiss(fileId);
    thumbFetchingRef.current.delete(fileId);
    delete fetchedThumbHashByIdRef.current[fileId];
    setFetchedThumbsWithLayoutDebug((prev) => {
      if (!(fileId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  }, []);

  const applySavedFileListMetadata = useCallback(
    (
      fileId: string,
      detail?: {
        contentSha256?: string | null;
        version?: number | null;
        updatedAt?: string | null;
      },
    ): boolean => {
      const cachePatch = readFileListIncrementalPatch(fileId);
      const eventPatch: FileListIncrementalPatch = {};
      if (detail?.contentSha256) {
        eventPatch.content_sha256 = detail.contentSha256;
      }
      if (typeof detail?.version === "number") {
        eventPatch.version = detail.version;
      }
      if (detail?.updatedAt) {
        eventPatch.updated_at = detail.updatedAt;
      }
      const mergedPatch: FileListIncrementalPatch = {
        ...(cachePatch ?? {}),
        ...eventPatch,
      };
      if (!cachePatch && Object.keys(mergedPatch).length === 0) {
        return false;
      }
      let applied = false;
      setFiles((prev) => {
        const index = prev.findIndex((file) => file.id === fileId);
        if (index === -1) {
          return prev;
        }
        applied = true;
        const next = [...prev];
        next[index] = mergeServerFilePatch(prev[index], mergedPatch);
        return next;
      });
      if (!applied) {
        return false;
      }
      markFileListIncrementalSave(fileId);
      if (isDebugRuntimeEnabled()) {
        const patched = readFileListIncrementalPatch(fileId);
        traceFileListSortOrder("incremental.apply", {
          fileId8: fileId.slice(0, 8),
          updatedAt: patched?.updated_at ?? detail?.updatedAt ?? null,
          contentSha8: patched?.content_sha256?.slice(0, 8) ?? null,
          localEditTime: FileSyncState.getLocalEditTime(fileId),
        });
      }
      if (detail?.contentSha256) {
        clearFetchedThumbForFile(fileId);
      }
      const cached = readFileListTreeCache();
      if (cached) {
        latestCatalogTreeRef.current = cached;
        catalogListingFingerprintRef.current = fingerprintCatalogListing(cached);
      }
      traceResourceOp("filelist", "incrementalApply", "ok", {
        fileId8: fileId.slice(0, 8),
      });
      return true;
    },
    [clearFetchedThumbForFile],
  );

  useEffect(() => {
    const onServerSaved = (event: Event) => {
      const detail = (event as CustomEvent<{
        id?: string;
        contentSha256?: string | null;
        version?: number | null;
        updatedAt?: string | null;
        skipped?: boolean;
      }>).detail;
      traceFileOpen("serverSaved", {
        fileId8: id8(detail?.id),
        sha8: detail?.contentSha256?.slice(0, 8) ?? null,
        skipped: detail?.skipped ?? false,
      }, "ok");
      const fileId = detail?.id;
      if (!fileId) {
        scheduleSilentRefresh();
        return;
      }
      if (
        applySavedFileListMetadata(fileId, {
          contentSha256: detail?.contentSha256 ?? null,
          version: detail?.version ?? null,
          updatedAt: detail?.updatedAt ?? null,
        })
      ) {
        return;
      }
      scheduleSilentRefresh();
    };
    const onIncrementalApply = (event: Event) => {
      const fileId = (event as CustomEvent<{ fileId?: string }>).detail?.fileId;
      if (!fileId) {
        return;
      }
      applySavedFileListMetadata(fileId);
    };
    window.addEventListener("excalidraw-server-saved", onServerSaved);
    window.addEventListener(
      FILE_LIST_INCREMENTAL_APPLY_EVENT,
      onIncrementalApply,
    );
    return () => {
      window.removeEventListener("excalidraw-server-saved", onServerSaved);
      window.removeEventListener(
        FILE_LIST_INCREMENTAL_APPLY_EVENT,
        onIncrementalApply,
      );
    };
  }, [applySavedFileListMetadata, scheduleSilentRefresh]);

  const nativeListThumbInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isDesktopEditorHub()) {
      return;
    }
    const candidates = thumbLoadScopeFiles.filter((file) => {
      if (!visibleThumbIds.has(file.id)) {
        return false;
      }
      if (editorRegistry.resolveKind(file.kind) !== "mindmap") {
        return false;
      }
      if (nativeListThumbInFlightRef.current.has(file.id)) {
        return false;
      }
      if (FileSyncState.hasUnsavedChanges(file.id)) {
        return false;
      }
      if (!fileAwaitingNativeThumbnail(file)) {
        return false;
      }
      if (!file.has_thumbnail) {
        return true;
      }
      const fetchedThumb = fetchedThumbsRef.current[file.id];
      return !!fetchedThumb && !isNativeMindMapThumbnailSvg(fetchedThumb);
    });
    if (candidates.length === 0) {
      return;
    }
    const candidateIds = candidates.map((file) => file.id);
    devDebug("thumbnail-pipeline", "[DEBUG] native-list-thumb | queue", {
      count: candidates.length,
      ids: candidates.map((file) => file.id.slice(0, 8)),
      names: candidates.map((file) => file.name).slice(0, 8),
    });
    markNativeThumbnailPending(candidateIds);
    let cancelled = false;
    for (const file of candidates) {
      nativeListThumbInFlightRef.current.add(file.id);
      void persistTrackedFileThumbnail(file)
        .then((updated) => {
          if (cancelled || !updated.has_thumbnail) {
            return;
          }
          const localThumb =
            LocalThumbnailCache.getForContent(
              updated.id,
              updated.content_sha256,
            ) ?? LocalThumbnailCache.get(updated.id);
          setFiles((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          );
          if (localThumb) {
            fetchedThumbHashByIdRef.current[updated.id] =
              fileThumbnailCacheKey(updated);
            setFetchedThumbsWithLayoutDebug((prev) => ({
              ...prev,
              [updated.id]: localThumb,
            }));
          }
          devDebug("thumbnail-pipeline", "[DEBUG] native-list-thumb | ok", {
            id: updated.id,
            id8: updated.id.slice(0, 8),
            hasThumb: !!updated.has_thumbnail,
            contentSha: updated.content_sha256 ?? null,
            localThumbLen: localThumb?.length ?? 0,
          });
        })
        .catch((error: unknown) => {
          devDebug("thumbnail-pipeline", "[DEBUG] native-list-thumb | error", {
            id: file.id,
            id8: file.id.slice(0, 8),
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        })
        .finally(() => {
          nativeListThumbInFlightRef.current.delete(file.id);
          clearNativeThumbnailPending([file.id]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    fetchedThumbs,
    setFetchedThumbsWithLayoutDebug,
    thumbLoadScopeFiles,
    visibleThumbIds,
  ]);

  const openNewFileDialog = useCallback(() => {
    setNewFileDialogOpen(true);
  }, []);

  const sidebarTargetFolderId = useMemo(
    () =>
      resolveSidebarTargetFolderId(sidebarView, currentFolderId, foldersById),
    [sidebarView, currentFolderId, foldersById],
  );

  const newDocumentFolderId = useMemo((): string | null | undefined => {
    if (sidebarView !== "all" && !isDesktopEditorHub()) {
      return undefined;
    }
    return sidebarTargetFolderId;
  }, [sidebarTargetFolderId, sidebarView]);

  const importTargetFolderId = sidebarTargetFolderId;

  const ensureDefaultDataDirectoryFolderId = useCallback(async () => {
    if (!isDesktopEditorHub() || !isLocalDirectoryRoot) {
      return null;
    }
    setMappingBusy(true);
    try {
      const result = await ensureDefaultDataDirectoryMapped();
      const folderId = result?.folder?.id ?? null;
      if (!folderId || !result) {
        throw new Error("无法映射默认目录");
      }
      defaultDataDirectoryFolderIdRef.current = folderId;
      setDefaultDataDirectoryFolderId(folderId);
      if (result.tree) {
        applyCatalogTree(result.tree);
      }
      return folderId;
    } finally {
      setMappingBusy(false);
    }
  }, [applyCatalogTree, isLocalDirectoryRoot]);

  const resolveDefaultDataDirectoryFolderId = useCallback(async () => {
    if (!isDesktopEditorHub()) {
      return null;
    }
    const cached = defaultDataDirectoryFolderIdRef.current;
    if (cached && foldersById.has(cached)) {
      return cached;
    }
    const absPath = await resolveDefaultDataDirectoryPath();
    const tree = latestCatalogTreeRef.current;
    if (tree) {
      const fromTree = findDefaultDataDirectoryFolderId(tree.folders, absPath);
      if (fromTree) {
        defaultDataDirectoryFolderIdRef.current = fromTree;
        setDefaultDataDirectoryFolderId(fromTree);
        return fromTree;
      }
    }
    setMappingBusy(true);
    try {
      const result = await ensureDefaultDataDirectoryMapped();
      const folderId = result?.folder?.id ?? null;
      if (folderId) {
        defaultDataDirectoryFolderIdRef.current = folderId;
        setDefaultDataDirectoryFolderId(folderId);
      }
      if (result?.tree) {
        applyCatalogTree(result.tree);
      }
      return folderId;
    } finally {
      setMappingBusy(false);
    }
  }, [applyCatalogTree, foldersById]);

  useEffect(() => {
    if (!isDesktopEditorHub() || !defaultDataDirectoryOnlyView) {
      return;
    }
    let cancelled = false;
    void resolveDefaultDataDirectoryFolderId()
      .then((folderId) => {
        if (!cancelled) {
          setDefaultDataDirectoryFolderId(folderId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDefaultDataDirectoryFolderId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [defaultDataDirectoryOnlyView, resolveDefaultDataDirectoryFolderId]);

  const gridListKey = useMemo(
    () =>
      `${sidebarView}:${currentFolderId ?? "root"}:${sortKey}:${searchQuery.trim()}:${flatFolderView ? "flat" : "nested"}:${defaultDataDirectoryOnlyView ? "default-dir" : "all-dir"}`,
    [currentFolderId, defaultDataDirectoryOnlyView, flatFolderView, searchQuery, sidebarView, sortKey],
  );

  const GRID_ENTER_ANIM_MS = 280;
  const [gridEnterAnimate, setGridEnterAnimate] = useState(true);
  useLayoutEffect(() => {
    if (startupGate.isColdStart || filteredFiles.length > 24) {
      setGridEnterAnimate(false);
      return;
    }
    setGridEnterAnimate(true);
    const timer = window.setTimeout(
      () => setGridEnterAnimate(false),
      GRID_ENTER_ANIM_MS,
    );
    return () => window.clearTimeout(timer);
  }, [gridListKey, filteredFiles.length, startupGate.isColdStart]);

  useEffect(() => {
    startFileListScrollMonitoring();
    refreshFileListScrollMonitoring();
    const detach = attachFileListScrollElement(mainRef.current);
    return detach;
  }, [loading, sidebarView, currentFolderId]);

  useEffect(() => {
    recordFileListScrollContext({
      listedFileCount: filteredFiles.length,
      domCardCount: computeFileListGridListedCellCount(
        filteredFiles.length,
        showNewEntryCard,
      ),
      virtualized: false,
    });
  }, [
    filteredFiles.length,
    fetchedThumbs,
    showNewEntryCard,
    visibleThumbIds.size,
  ]);

  // 切换作用域（文件夹/视图/排序/搜索）时重置可见集，卡片会随 gridListKey 重新挂载再测量。
  useLayoutEffect(() => {
    setVisibleThumbIds(new Set());
  }, [gridListKey]);

  // 网格渲染后按布局一次性测量视口内卡片并入可见集（只增不减），
  // 保证「真实需加载的缩略图」同时进入蓝色 loading，而非分批/只剩一个。
  // 滚动进入的卡片由 IntersectionObserver 补充，故无需随 fetchedThumbs 重测。
  useLayoutEffect(() => {
    if (filteredFiles.length === 0) {
      return;
    }
    syncVisibleThumbIdsFromLayout();
  }, [filteredFiles.length, gridListKey, syncVisibleThumbIdsFromLayout]);

  const openNewDocument = useCallback(
    (kind: string) => {
      devDebug("api-sync", "openNewDocument | start", {
        kind,
        folderId: newDocumentFolderId ?? null,
        sidebarView,
      });
      void (async () => {
        const resolvedFolderId =
          typeof newDocumentFolderId === "string" &&
          newDocumentFolderId.length > 0
            ? newDocumentFolderId
            : isLocalDirectoryRoot
            ? await ensureDefaultDataDirectoryFolderId()
            : null;
        const bootstrapOpts =
          sidebarView === "recent"
            ? { saveTarget: "native" as const, folderId: null }
            : resolvedFolderId
            ? {
                folderId: resolvedFolderId,
                saveTarget: "catalog" as const,
              }
            : undefined;
        return bootstrapLocalDraftSession(kind, bootstrapOpts);
      })()
        .then(({ id }) => {
          const hash = editorRegistry.buildFileHash(id, kind);
          devDebug("api-sync", "openNewDocument | navigate", {
            id8: id.slice(0, 20),
            hash,
          });
          void openEditorFileTab({
            fileId: id,
            kind,
            title: defaultNameForDocumentKind(kind),
          });
        })
        .catch((err) => {
          devDebug("api-sync", "openNewDocument | failed", {
            message: err instanceof Error ? err.message : String(err),
          });
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [ensureDefaultDataDirectoryFolderId, isLocalDirectoryRoot, newDocumentFolderId, sidebarView],
  );

  const commitNewDocumentPick = useCallback(
    (kind: string) => {
      setNewFileDialogOpen(false);
      openNewDocument(kind);
    },
    [openNewDocument],
  );

  const dismissFormalCreateDialog = useCallback(() => {
    setFormalCreateKind(null);
  }, []);

  const formalCreateOverlayDismiss = useStrictOverlayDismiss(
    dismissFormalCreateDialog,
  );

  const commitFormalCreate = useCallback(
    async (name: string, folderId: string | null) => {
      const kind = formalCreateKind;
      if (!kind || formalCreateInFlightRef.current) {
        return;
      }
      const resolvedFolderId =
        folderId ??
        (isLocalDirectoryRoot
          ? await ensureDefaultDataDirectoryFolderId()
          : null);
      if (!resolvedFolderId) {
        setError("请选择保存位置");
        return;
      }
      formalCreateInFlightRef.current = true;
      setFormalCreateSaving(true);
      devDebug("api-sync", "commitFormalCreate | start", {
        kind,
        name,
        folderId: resolvedFolderId,
      });
      try {
        const plugin = editorRegistry.getByKind(kind);
        if (!plugin?.createFile) {
          throw new Error(`无法创建 ${kind} 文档`);
        }
        const { id } = await plugin.createFile({
          name,
          folderId: resolvedFolderId,
        });
        devDebug("api-sync", "commitFormalCreate | ok", {
          id8: id.slice(0, 8),
          kind,
        });
        setFormalCreateKind(null);
        void openEditorFileTab({
          fileId: id,
          kind,
          title: name,
        });
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        await refresh({ silent: true, noErrorOnFailure: true });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? "创建失败");
        devDebug("api-sync", "commitFormalCreate | failed", { message });
        setFormalCreateKind(null);
        setError(message);
      } finally {
        formalCreateInFlightRef.current = false;
        setFormalCreateSaving(false);
      }
    },
    [ensureDefaultDataDirectoryFolderId, formalCreateKind, isLocalDirectoryRoot, refresh],
  );

  const commitMove = useCallback(async () => {
    if (!moveDialogFile) {
      return;
    }
    const current = moveDialogFile.folder_id ?? null;
    if (moveTargetFolderId === current) {
      setMoveDialogFile(null);
      return;
    }
    try {
      await ServerSync.moveFiles([moveDialogFile.id], moveTargetFolderId);
      await refresh({ silent: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setMoveDialogFile(null);
    }
  }, [moveDialogFile, moveTargetFolderId, refresh]);

  const importCreatedIdsRef = useRef<string[]>([]);
  const activeImportTargetFolderIdRef = useRef<string | null | undefined>(
    undefined,
  );
  const postImportSelectFolderIdRef = useRef<string | null | undefined>(
    undefined,
  );

  const importOneFileWithKind = useCallback(
    async (file: File, kind: string) => {
      if (file.size > EDITOR_MAX_IMAGE_FILE_BYTES) {
        throw new Error(
          `「${
            file.name
          }」超过 ${formatEditorMaxImageFileSizeMb()} 上限，无法导入。`,
        );
      }
      const plugin = editorRegistry.getByKind(kind);
      if (!plugin?.importFile) {
        throw new Error(`无法使用所选编辑器导入「${file.name}」。`);
      }
      logList.debug("import start", {
        name: file.name,
        type: file.type,
        size: file.size,
        kind,
        folderId:
          activeImportTargetFolderIdRef.current === undefined
            ? importTargetFolderId
            : activeImportTargetFolderIdRef.current,
      });
      const targetFolderId =
        activeImportTargetFolderIdRef.current === undefined
          ? importTargetFolderId
          : activeImportTargetFolderIdRef.current;
      const { id } = await plugin.importFile({
        file,
        fileName: sanitizeFileBaseName(file.name),
        folderId: targetFolderId,
      });
      importCreatedIdsRef.current.push(id);
    },
    [importTargetFolderId],
  );

  const finishImportBatch = useCallback(async () => {
    const createdIds = importCreatedIdsRef.current;
    importCreatedIdsRef.current = [];
    setImporting(false);
    if (createdIds.length === 0) {
      return;
    }
    for (const id of createdIds) {
      clearThumbnailServerMiss(id);
      thumbFetchingRef.current.delete(id);
      delete fetchedThumbHashByIdRef.current[id];
    }
    setFetchedThumbs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of createdIds) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    try {
      await refresh({ silent: true, noErrorOnFailure: true });
      setImportNotice(null);
      const selectAfterImport = postImportSelectFolderIdRef.current;
      if (selectAfterImport !== undefined) {
        setSidebarView("all");
        setCurrentFolderId(selectAfterImport);
        setMobileTreeOpen(false);
      }
    } catch {
      setImportNotice(
        `已导入 ${createdIds.length} 个文件，但列表未能自动更新。请刷新本页以查看最新文件。`,
      );
    } finally {
      activeImportTargetFolderIdRef.current = undefined;
      postImportSelectFolderIdRef.current = undefined;
    }
  }, [refresh]);

  const processImportQueue = useCallback(
    async function processImportQueue() {
      try {
        while (importQueueRef.current.length > 0) {
          const queue = importQueueRef.current;
          const batch = queue.slice(0, FILE_IMPORT_CONCURRENCY);
          const detectedBatch = await Promise.all(
            batch.map(async (file) => ({
              file,
              kinds: await detectImportCandidateKinds(file),
            })),
          );
          const firstPickerIndex = detectedBatch.findIndex(
            ({ kinds }) => kinds.length > 1,
          );
          const autoImportEntries =
            firstPickerIndex >= 0
              ? detectedBatch.slice(0, firstPickerIndex)
              : detectedBatch;

          for (const { file, kinds } of autoImportEntries) {
            if (kinds.length === 0) {
              throw new Error(
                `无法识别「${
                  file.name
                }」的文档格式，请确认它是 ${editorRegistry.importableEditorNames()} 文件。`,
              );
            }
          }

          if (autoImportEntries.length > 0) {
            const results = await Promise.allSettled(
              autoImportEntries.map(({ file, kinds }) =>
                importOneFileWithKind(file, kinds[0]!),
              ),
            );
            const failed = results.find(
              (result): result is PromiseRejectedResult =>
                result.status === "rejected",
            );
            if (failed) {
              throw failed.reason;
            }
            importQueueRef.current = queue.slice(autoImportEntries.length);
          }

          if (firstPickerIndex >= 0) {
            const { file, kinds } = detectedBatch[firstPickerIndex]!;
            const plugins = kinds
              .map((k) => editorRegistry.getByKind(k))
              .filter((p): p is EditorPlugin => !!p?.importFile);
            pendingImportFileRef.current = file;
            setImportPickerFileName(file.name);
            setImportKindPlugins(plugins);
            setImportKindDialogOpen(true);
            setImporting(false);
            return;
          }
        }
        await finishImportBatch();
      } catch (e: unknown) {
        logList.debug("import error", e);
        const createdIds = [...importCreatedIdsRef.current];
        const failedDeletes = await rollbackCreatedImportFiles(createdIds);
        importCreatedIdsRef.current = [];
        importQueueRef.current = [];
        activeImportTargetFolderIdRef.current = undefined;
        postImportSelectFolderIdRef.current = undefined;
        let msg = formatImportErrorMessage(e);
        if (failedDeletes.length > 0) {
          msg += ` 另：有 ${failedDeletes.length} 个已创建项未能从服务器自动删除，请刷新列表后检查并手动删除重复或空白文件。`;
        }
        setImportNotice(null);
        setError(msg);
        setImporting(false);
      }
    },
    [finishImportBatch, importOneFileWithKind],
  );

  const startImportWithTarget = useCallback(
    async (
      fileList: File[],
      targetFolderId: string | null,
      opts?: { selectTargetAfterImport?: boolean },
    ) => {
      if (fileList.length === 0) {
        return;
      }
      activeImportTargetFolderIdRef.current = targetFolderId;
      postImportSelectFolderIdRef.current = opts?.selectTargetAfterImport
        ? targetFolderId
        : undefined;
      clearAllThumbnailServerMisses();
      setImporting(true);
      setError(null);
      setImportNotice(null);
      importCreatedIdsRef.current = [];
      importQueueRef.current = [...fileList];
      await processImportQueue();
    },
    [processImportQueue],
  );

  const commitImportKindPick = useCallback(
    async (kind: string) => {
      const file = pendingImportFileRef.current;
      if (!file) {
        setImportKindDialogOpen(false);
        return;
      }
      setImportKindDialogOpen(false);
      setImportPickerFileName(null);
      pendingImportFileRef.current = null;
      setImporting(true);
      setError(null);
      try {
        await importOneFileWithKind(file, kind);
        importQueueRef.current = importQueueRef.current.slice(1);
        await processImportQueue();
      } catch (e: unknown) {
        logList.debug("import error", e);
        const createdIds = [...importCreatedIdsRef.current];
        const failedDeletes = await rollbackCreatedImportFiles(createdIds);
        importCreatedIdsRef.current = [];
        importQueueRef.current = [];
        activeImportTargetFolderIdRef.current = undefined;
        postImportSelectFolderIdRef.current = undefined;
        let msg = formatImportErrorMessage(e);
        if (failedDeletes.length > 0) {
          msg += ` 另：有 ${failedDeletes.length} 个已创建项未能从服务器自动删除，请刷新列表后检查并手动删除重复或空白文件。`;
        }
        setImportNotice(null);
        setError(msg);
        setImporting(false);
      }
    },
    [importOneFileWithKind, processImportQueue],
  );

  const dismissImportKindDialog = useCallback(() => {
    setImportKindDialogOpen(false);
    setImportPickerFileName(null);
    pendingImportFileRef.current = null;
    importQueueRef.current = [];
    void (async () => {
      const createdIds = [...importCreatedIdsRef.current];
      if (createdIds.length > 0) {
        await rollbackCreatedImportFiles(createdIds);
        importCreatedIdsRef.current = [];
      }
      activeImportTargetFolderIdRef.current = undefined;
      postImportSelectFolderIdRef.current = undefined;
      setImporting(false);
    })();
  }, []);

  const importKindOverlayDismiss = useStrictOverlayDismiss(
    dismissImportKindDialog,
  );

  const applySceneFilesViewSwitch = useCallback(
    (intent: SceneFilesIntent) => {
      if (intent.type === "track-recent") {
        setSidebarView("recent");
        setMobileTreeOpen(false);
        return;
      }
      if (intent.type === "import-needs-folder") {
        setSidebarView("all");
        setCurrentFolderId(null);
        setMobileTreeOpen(false);
        return;
      }
      setSidebarView("all");
      setMobileTreeOpen(false);
      setCurrentFolderId(intent.folderId);
      setAllFilesTreeExpanded(true);
      setExpandedFolders((prev) => ({
        ...prev,
        ...expandFolderAncestorIds(intent.folderId, foldersById),
      }));
    },
    [foldersById, setCurrentFolderId, setSidebarView],
  );

  const openImportFolderPicker = useCallback((fileList: File[]) => {
    pendingImportFilesRef.current = fileList;
    setImportFolderPickerFiles(fileList);
    setImportFolderPickerTargetId(null);
    setImportFolderPickerOpen(true);
  }, []);

  const dismissImportFolderPicker = useCallback(() => {
    setImportFolderPickerOpen(false);
    setImportFolderPickerTargetId(null);
    setImportFolderPickerFiles([]);
    pendingImportFilesRef.current = [];
  }, []);

  const handleImportDialogPickFiles = useCallback((fileList: File[]) => {
    const next = takeImportableFilesFromList(fileList);
    if (next.length === 0) {
      setError(
        "未识别到可导入的文档文件（如 .excalidraw、.smm、.json、.png、.svg）。",
      );
      return;
    }
    pendingImportFilesRef.current = next;
    setImportFolderPickerFiles(next);
  }, []);

  const commitImportFolderPicker = useCallback(async () => {
    const targetFolderId = importFolderPickerTargetId;
    if (!targetFolderId) {
      return;
    }
    const fileList = [...pendingImportFilesRef.current];
    dismissImportFolderPicker();
    setSidebarView("all");
    setCurrentFolderId(targetFolderId);
    setAllFilesTreeExpanded(true);
    setExpandedFolders((prev) => ({
      ...prev,
      ...expandFolderAncestorIds(targetFolderId, foldersById),
    }));
    setMobileTreeOpen(false);
    await startImportWithTarget(fileList, targetFolderId, {
      selectTargetAfterImport: true,
    });
  }, [
    dismissImportFolderPicker,
    foldersById,
    importFolderPickerTargetId,
    setCurrentFolderId,
    setSidebarView,
    startImportWithTarget,
  ]);

  const importFolderPickerOverlayDismiss = useStrictOverlayDismiss(
    dismissImportFolderPicker,
  );

  const applyTrackRecentAbsPaths = useCallback(
    async (absPaths: string[]) => {
      if (!canOpenRecentByCatalogPath()) {
        setError("「最近」仅支持在桌面版通过文件路径添加外部文件。");
        return;
      }
      const filtered = filterImportableAbsPaths(absPaths);
      if (filtered.length === 0) {
        setError(
          "未识别到可打开的文档文件（如 .excalidraw、.smm、.json、.png、.svg）。",
        );
        return;
      }
      clearAllThumbnailServerMisses();
      setError(null);
      setImportNotice(null);
      devDebug("file-list", "[DEBUG] recent-track | start", {
        paths: filtered.map((item) => item.slice(-160)),
        sidebarView,
        currentFolderId,
      });
      const { tracked, errors, filesByPath, trackedFilesInOrder } =
        await trackCatalogPathsToRecent(filtered);
      devDebug("file-list", "[DEBUG] recent-track | result", {
        tracked,
        errors,
        files: Object.entries(filesByPath).map(([absPath, file]) => ({
          pathTail: absPath.slice(-160),
          id: file.id,
          kind: file.kind,
          health: file.health ?? null,
          hasThumb: !!file.has_thumbnail,
          contentSha: file.content_sha256 ?? null,
        })),
      });
      if (Object.keys(filesByPath).length > 0) {
        const trackedPaths = Object.keys(filesByPath);
        const filesByIdMap = new Map(
          filesRef.current.map((file) => [file.id, file]),
        );
        setRecentPathCatalogFiles((prev) =>
          mergeRecentPathCatalogBatch(
            prev,
            trackedPaths,
            filesByPath,
            filesByIdMap,
          ),
        );
      }
      if (tracked === 0) {
        setError(errors[0] ?? "无法打开文件，请重试。");
        return;
      }
      const pathEntries = trackedFilesInOrder.slice(1).map((file) => ({
        fileId: file.id,
        absPath:
          Object.entries(filesByPath).find(([, item]) => item.id === file.id)?.[0] ??
          null,
      }));
      touchRecentTrackedFiles(pathEntries);
      const firstFile = trackedFilesInOrder[0];
      const firstPath =
        Object.entries(filesByPath).find(([, item]) => item.id === firstFile.id)?.[0] ??
        null;
      openTrackedCatalogFile(firstFile, firstPath);
      recentResolvedPathsKeyRef.current = fingerprintRecentAbsPaths(
        collectRecentAbsPathsFromEntries(),
      );
      if (errors.length > 0) {
        setImportNotice(
          `已打开 ${trackedFilesInOrder[0]?.name ?? "文件"}；${errors.length} 个失败：${errors[0]}`,
        );
      }
      void generateRecentPathThumbnails(filesByPath)
        .then((updated) => {
          devDebug("file-list", "[DEBUG] recent-track | thumbnails done", {
            updated: Object.entries(updated).map(([absPath, file]) => ({
              pathTail: absPath.slice(-160),
              id: file.id,
              kind: file.kind,
              hasThumb: !!file.has_thumbnail,
              contentSha: file.content_sha256 ?? null,
            })),
          });
          if (Object.keys(updated).length === 0) {
            return;
          }
          const updatedPaths = Object.keys(updated);
          const filesByIdMap = new Map(
            filesRef.current.map((file) => [file.id, file]),
          );
          setRecentPathCatalogFiles((prev) =>
            mergeRecentPathCatalogBatch(
              prev,
              updatedPaths,
              updated,
              filesByIdMap,
            ),
          );
        })
        .catch((error: unknown) => {
          logList.debug("recent thumbnail generation failed", error);
        });
    },
    [currentFolderId, openTrackedCatalogFile, sidebarView, touchRecentTrackedFiles],
  );

  const handleSceneAbsPaths = useCallback(
    async (absPaths: string[], opts?: { intent?: SceneFilesIntent }) => {
      const intent =
        opts?.intent ??
        resolveSceneFilesIntent(sidebarView, currentFolderId, foldersById);
      applySceneFilesViewSwitch(intent);
      if (intent.type !== "track-recent") {
        setError("系统打开文件仅支持通过「最近」打开。");
        return;
      }
      try {
        await applyTrackRecentAbsPaths(absPaths);
      } catch (error: unknown) {
        logList.debug("scene abs paths action failed", error);
        setError(
          error instanceof Error ? error.message : "打开文件失败，请重试。",
        );
      }
    },
    [
      applySceneFilesViewSwitch,
      applyTrackRecentAbsPaths,
      currentFolderId,
      foldersById,
      sidebarView,
    ],
  );

  useEffect(() => {
    if (!isDesktopEditorHub()) {
      return;
    }
    return bindDesktopOpenDocumentPaths((paths) => {
      void handleSceneAbsPaths(paths, { intent: { type: "track-recent" } });
    });
  }, [handleSceneAbsPaths]);

  const handleSceneFiles = useCallback(
    async (fileList: File[], opts?: { intent?: SceneFilesIntent }) => {
      const next = takeImportableFilesFromList(fileList);
      if (next.length === 0) {
        setError(
          "未识别到可导入的文档文件（如 .excalidraw、.smm、.json、.png、.svg）。",
        );
        return;
      }
      const intent = resolveSceneFilesIntent(
        sidebarView,
        currentFolderId,
        foldersById,
        opts?.intent,
      );
      applySceneFilesViewSwitch(intent);

      try {
        if (intent.type === "track-recent") {
          const absPaths = readDroppedFileAbsPaths(next);
          if (absPaths.length === 0) {
            setError("无法获取文件路径，请从文件管理器拖入或使用桌面版。");
            return;
          }
          await applyTrackRecentAbsPaths(absPaths);
          return;
        }

        if (intent.type === "import-needs-folder") {
          if (isLocalDirectoryRoot) {
            const folderId = await ensureDefaultDataDirectoryFolderId();
            if (folderId) {
              await startImportWithTarget(next, folderId, {
                selectTargetAfterImport: true,
              });
              return;
            }
          }
          openImportFolderPicker(next);
          return;
        }

        await startImportWithTarget(next, intent.folderId, {
          selectTargetAfterImport: true,
        });
      } catch (error: unknown) {
        logList.debug("scene files action failed", error);
        setError(
          error instanceof Error ? error.message : "处理拖入文件失败，请重试。",
        );
      }
    },
    [
      applySceneFilesViewSwitch,
      applyTrackRecentAbsPaths,
      ensureDefaultDataDirectoryFolderId,
      foldersById,
      isLocalDirectoryRoot,
      openImportFolderPicker,
      startImportWithTarget,
    ],
  );

  const workspaceDropIntent = useMemo(
    () => resolveSceneFilesIntent(sidebarView, currentFolderId, foldersById),
    [sidebarView, currentFolderId, foldersById],
  );

  const workspaceDropOverlayLabel = useMemo(
    () => sceneDropOverlayLabel(workspaceDropIntent),
    [workspaceDropIntent],
  );

  const onSceneImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files;
    const picked = raw ? Array.from(raw) : [];
    e.target.value = "";
    if (picked.length === 0) {
      return;
    }
    void handleSceneFiles(picked);
  };

  const clearFileDropHover = useCallback(() => {
    setFileDropHoverActive(false);
  }, []);

  const onFileListImportDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (importing) {
        return;
      }
      if (draggingFolderId || e.dataTransfer.types?.includes(FOLDER_DND_MIME)) {
        return;
      }
      if (!e.dataTransfer.types?.includes("Files")) {
        return;
      }
      setSidebarFileDropTargetId(null);
      setFileDropHoverActive(true);
    },
    [draggingFolderId, importing],
  );

  const onFileListImportDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (importing || draggingFolderId) {
        return;
      }
      const related = e.relatedTarget;
      if (related instanceof Node && e.currentTarget.contains(related)) {
        return;
      }
      clearFileDropHover();
    },
    [clearFileDropHover, draggingFolderId, importing],
  );

  /** 覆盖左侧树 + 右侧主区；与文件夹内拖移区分 */
  const onFileListImportDragOver = useCallback(
    (e: React.DragEvent) => {
      if (importing) {
        return;
      }
      if (draggingFolderId || e.dataTransfer.types?.includes(FOLDER_DND_MIME)) {
        return;
      }
      if (!e.dataTransfer.types?.includes("Files")) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setFileDropHoverActive(true);
    },
    [importing, draggingFolderId],
  );

  const onFileListImportDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearFileDropHover();
      if (importing) {
        return;
      }
      if (draggingFolderId || e.dataTransfer.types?.includes(FOLDER_DND_MIME)) {
        return;
      }
      const { files } = e.dataTransfer;
      if (!files?.length) {
        setError("未能读取拖入的文件，请重试。");
        return;
      }

      void handleSceneFiles(Array.from(files));
    },
    [
      clearFileDropHover,
      draggingFolderId,
      handleSceneFiles,
      importing,
    ],
  );

  const handleDelete = (e: React.MouseEvent, file: ServerFile) => {
    e.stopPropagation();
    setFileDeleteTarget(file);
  };

  const confirmDeleteFile = async () => {
    const file = fileDeleteTarget;
    if (!file || fileDeleteBusy) {
      return;
    }
    const { id } = file;
    setFileDeleteBusy(true);
    try {
      if (isLocalDraftFileId(id)) {
        await discardLocalDraftSession(id);
        await refresh({ silent: true });
        setFileDeleteTarget(null);
        return;
      }
      await ServerSync.deleteFile(id);
      FileSyncState.clearLocalCache(id);
      FileSyncState.clearHashStateForFile(id);
      LocalThumbnailCache.clear(id);
      setFetchedThumbs((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      thumbFetchingRef.current.delete(id);
      if (file.origin === "external") {
        const recentPath = Object.entries(recentPathCatalogFiles).find(
          ([, trackedFile]) => trackedFile.id === id,
        )?.[0];
        if (recentPath) {
          removeRecentFileEntry(toRecentPathEntryId(recentPath));
          setRecentPathCatalogFiles((prev) => {
            const next = { ...prev };
            delete next[recentPath];
            return next;
          });
          recentResolvedPathsKeyRef.current = null;
          setRecentRevision((value) => value + 1);
        }
      }
      invalidateInflightRefresh();
      setFiles((prev) => {
        const next = prev.filter((item) => item.id !== id);
        writeFileListTreeCache({ folders: foldersRef.current, files: next });
        return next;
      });
      setFileDeleteTarget(null);
      void refresh({ silent: true, noErrorOnFailure: true }).catch(() => {
        // Background reconcile; optimistic state already applied.
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setFileDeleteBusy(false);
    }
  };

  const handleRemoveFromRecent = (e: React.MouseEvent, file: ServerFile) => {
    e.stopPropagation();
    const recentPath = Object.entries(recentPathCatalogFiles).find(
      ([, trackedFile]) => trackedFile.id === file.id,
    )?.[0];
    if (recentPath) {
      removeRecentFileEntry(toRecentPathEntryId(recentPath));
      setRecentPathCatalogFiles((prev) => {
        const next = { ...prev };
        delete next[recentPath];
        return next;
      });
    } else {
      removeRecentFileEntry(file.id);
    }
    recentResolvedPathsKeyRef.current = null;
    setRecentRevision((value) => value + 1);
  };

  const handleDownload = async (
    e: React.MouseEvent,
    id: string,
    name: string,
  ) => {
    e.stopPropagation();
    try {
      if (isLocalDraftFileId(id)) {
        await downloadLocalDraftFile(id, name);
        return;
      }
      await ServerSync.downloadFile(id, name);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    suppressNextCardOpenRef.current = null;
    setRenamingId(id);
    setRenameValue(name);
  };

  const suppressNextCardOpen = (id: string) => {
    suppressNextCardOpenRef.current = id;
  };

  const consumeSuppressedCardOpen = (id: string): boolean => {
    if (suppressNextCardOpenRef.current !== id) {
      return false;
    }
    suppressNextCardOpenRef.current = null;
    return true;
  };

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      try {
        const currentFile = filesRef.current.find((file) => file.id === id);
        const normalizedName = stripKnownDocumentExtension(trimmed).trim();
        let renamedDisplayName = normalizedName || trimmed;
        const duplicate = currentFile
          ? filesRef.current.some(
              (file) =>
                file.id !== id &&
                (file.folder_id ?? null) ===
                  (currentFile.folder_id ?? null) &&
                editorRegistry.resolveKind(file.kind) ===
                  editorRegistry.resolveKind(currentFile.kind) &&
                file.name.toLocaleLowerCase() ===
                  normalizedName.toLocaleLowerCase(),
            )
          : false;
        if (duplicate) {
          setError("文件名已存在");
          setRenamingId(null);
          return;
        }
        if (isLocalDraftFileId(id)) {
          const existing = LocalDraftSessions.get(id);
          if (existing) {
            LocalDraftSessions.upsert({
              ...existing,
              name: normalizedName || trimmed,
              updated_at: new Date().toISOString(),
            });
          }
          setRecentRevision((n) => n + 1);
        } else {
          const renamed = await ServerSync.renameFile(
            id,
            normalizedName || trimmed,
          );
          const actualName = renamed.name || normalizedName || trimmed;
          renamedDisplayName = actualName;
          const recentPath = Object.entries(recentPathCatalogFiles).find(
            ([, trackedFile]) => trackedFile.id === id,
          )?.[0];
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, name: actualName } : f)),
          );
          if (recentPath && renamed.origin === "external") {
            const nextPath = recentPathAfterRename(
              recentPath,
              actualName,
              renamed.kind,
            );
            removeRecentFileEntry(toRecentPathEntryId(recentPath));
            touchRecentOpenedFile({ fileId: id, absPath: nextPath });
            setRecentPathCatalogFiles((prev) => {
              const next = { ...prev };
              delete next[recentPath];
              next[nextPath] = renamed;
              return next;
            });
            recentResolvedPathsKeyRef.current = null;
            setRecentRevision((value) => value + 1);
          }
        }
        window.dispatchEvent(
          new CustomEvent("excalidraw-file-renamed", {
            detail: { id, name: renamedDisplayName },
          }),
        );
      } catch (err: any) {
        const message = err.message ?? "重命名失败";
        setError(message);
        setRenamingId(null);
        return;
      }
    }
    setRenamingId(null);
  };

  const selectFolder = (folderId: string) => {
    if (sidebarView === "all" && currentFolderId === folderId) {
      traceIssueDiag(
        "sidebar.tree",
        "selectFolder.skip_same",
        { folderId8: folderId.slice(0, 8) },
        "skip",
      );
      setMobileTreeOpen(false);
      return;
    }
    const finish = startIssueDiagTimer("sidebar.tree", "selectFolder", {
      folderId8: folderId.slice(0, 8),
      fromFolderId8: currentFolderId ? currentFolderId.slice(0, 8) : null,
      sidebarView,
      folderName: foldersById.get(folderId)?.name ?? null,
    });
    sidebarTreeSelectRef.current = { folderId, finish };
    traceIssueDiag(
      "sidebar.tree",
      "selectFolder.click",
      {
        folderId8: folderId.slice(0, 8),
        folderName: foldersById.get(folderId)?.name ?? null,
      },
      "start",
    );
    setSidebarView("all");
    if (isFileListLayoutDebugEnabled()) {
      const data = {
        trigger: "selectFolder",
        fromFolderId: currentFolderId ?? "__ROOT__",
        fromFolderName: currentFolderId
          ? foldersById.get(currentFolderId)?.name ?? null
          : "本地目录",
        toFolderId: folderId ?? "__ROOT__",
        toFolderName: folderId
          ? foldersById.get(folderId)?.name ?? null
          : "本地目录",
        visibleThumbs: visibleThumbIds.size,
        breadcrumbSegments: folderId
          ? (() => {
              const segments: string[] = [];
              let cursor: string | null = folderId;
              while (cursor) {
                const folder = foldersById.get(cursor);
                if (!folder) {
                  break;
                }
                segments.unshift(folder.name);
                cursor = folder.parent_id;
              }
              return segments.length;
            })()
          : 0,
      };
      queueTopbarLayoutDebug("after selectFolder topbar layout", data);
      debugFileListLayout(
        "before selectFolder setState",
        collectLayoutDebugData(data),
      );
      traceTopbarLayoutFrames("selectFolder", data);
    }
    setCurrentFolderId(folderId);
    setExpandedFolders((prev) => ({
      ...prev,
      ...expandFolderAncestorIds(folderId, foldersById),
    }));
    setMobileTreeOpen(false);
  };

  const startRenameFolder = (folder: ServerFolder) => {
    setFolderContextMenu(null);
    setFolderDraft({ mode: "rename", folder });
    setFolderNameValue(folder.name);
  };

  const startCreateFolderInParent = (folder: ServerFolder) => {
    setFolderContextMenu(null);
    const parentId = folder.id;
    let name = "新建文件夹";
    let suffix = 1;
    const siblingNames = new Set(
      folders
        .filter((item) => folderParentId(item) === parentId)
        .map((item) => item.name),
    );
    while (siblingNames.has(name)) {
      name = `新建文件夹 (${suffix})`;
      suffix += 1;
    }
    setFolderNameValue(name);
    setFolderDraft({ mode: "create", parentId });
    setExpandedFolders((prev) => ({ ...prev, [parentId]: true }));
  };

  const openFolderContextMenu = (
    event: React.MouseEvent,
    folder: ServerFolder,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setFolderContextMenu({
      folder,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const commitFolderDraft = async () => {
    if (!folderDraft) {
      return;
    }
    const name = folderNameValue.trim();
    if (!name) {
      setFolderDraft(null);
      return;
    }
    try {
      if (folderDraft.mode === "create") {
        const parentId = folderDraft.parentId;
        debugFolderDnd("create folder start", {
          name,
          parentId: parentId ?? "__ROOT__",
          currentFolderId: currentFolderId ?? "__ROOT__",
        });
        const created = await ServerSync.createFolder(name, parentId);
        const siblingIds = [
          ...getOrderedFolderChildIds(parentId).filter(
            (id) => id !== created.id,
          ),
          created.id,
        ];
        debugFolderDnd("create folder reorder", {
          folderId: created.id,
          parentId: parentId ?? "__ROOT__",
          siblingCount: siblingIds.length,
          siblingIds: siblingIds.map((id) => id.slice(0, 8)),
        });
        await ServerSync.saveOrder(
          parentId,
          siblingIds.map((id) => ({ type: "folder" as const, id })),
        );
        debugFolderDnd("create folder done", { folderId: created.id });
        invalidateInflightRefresh();
        setFolders((prev) => {
          const next = [...prev, created];
          writeFileListTreeCache({ folders: next, files: filesRef.current });
          return next;
        });
        setExpandedFolders((prev) => ({
          ...prev,
          ...(parentId ? { [parentId]: true } : {}),
          [created.id]: true,
        }));
        setCurrentFolderId(created.id);
      } else {
        const normalizedParent = folderTreeParentId(folderDraft.folder);
        const duplicate = folders.some(
          (folder) =>
            folder.id !== folderDraft.folder.id &&
            folderTreeParentId(folder) === normalizedParent &&
            folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        );
        if (duplicate) {
          setError("文件夹名称已存在");
          setFolderDraft(null);
          return;
        }
        const updated = await ServerSync.renameFolder(
          folderDraft.folder.id,
          name,
        );
        invalidateInflightRefresh();
        setFolders((prev) => {
          const next = prev.map((folder) =>
            folder.id === updated.id ? updated : folder,
          );
          writeFileListTreeCache({ folders: next, files: filesRef.current });
          return next;
        });
      }
    } catch (err: any) {
      debugFolderDnd("folder draft failed", {
        mode: folderDraft.mode,
        message: err?.message ?? String(err),
      });
      setError(err.message);
    } finally {
      setFolderDraft(null);
    }
  };

  const deleteFolder = (folder: ServerFolder) => {
    setFolderContextMenu(null);
    setFolderDeleteTarget(folder);
  };

  const confirmDeleteFolder = async () => {
    const folder = folderDeleteTarget;
    if (!folder || folderDeleteBusy) {
      return;
    }
    const isMappedRoot = !!folder.is_mapping_root;
    setFolderDeleteBusy(true);
    try {
      const result = await ServerSync.deleteFolder(folder.id);
      invalidateInflightRefresh();
      if (
        isMappedRoot &&
        result?.scan &&
        result.scan.state === "idle" &&
        !result.scan.running
      ) {
        setCatalogScanNotice(null);
      }
      setFolders((prev) => {
        const next = prev.filter((item) => item.id !== folder.id);
        writeFileListTreeCache({ folders: next, files: filesRef.current });
        return next;
      });
      if (currentFolderId === folder.id) {
        setCurrentFolderId(ROOT_ID);
      }
      setFolderDeleteTarget(null);
      void refresh({ silent: true, noErrorOnFailure: true }).catch(() => {
        // Background reconcile; optimistic state already applied.
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFolderDeleteBusy(false);
    }
  };

  const openLocalFolder = async (folder: ServerFolder) => {
    setFolderContextMenu(null);
    try {
      await ServerSync.openLocalFolder(folder.id);
    } catch (err: any) {
      setError(err.message ?? "打开本地文件夹失败");
    }
  };

  const openLocalFile = async (file: ServerFile) => {
    try {
      await ServerSync.openLocalFile(file.id);
    } catch (err: any) {
      setError(err.message ?? "打开文件位置失败");
    }
  };

  // ── Sidebar folder drag: reorder siblings & reparent (nested) via POST /files/order ──

  const getOrderedFolderChildIds = useCallback(
    (parentId: string | null) =>
      folders
        .filter((f) => folderTreeParentId(f) === parentId)
        .sort(compareManual)
        .map((f) => f.id),
    [folders],
  );

  const applyMappingRootResult = useCallback(
    (
      result: MappingRootResult,
      options: { activateLocalDirectory?: boolean } = {},
    ): string | null => {
      devDebug("file-list", "[DEBUG] mapping-root | apply result", {
        folderId: result.folder?.id ?? null,
        folderName: result.folder?.name ?? null,
        absPathTail: result.mappingRoot?.absPath?.slice(-160) ?? null,
        tree: summarizeFileListTreeForDebug(result.tree),
        scanState: result.scan?.state ?? result.tree.scan?.state ?? null,
        scanPass: result.scan?.pass ?? result.tree.scan?.pass ?? null,
      });
      if (options.activateLocalDirectory ?? true) {
        setSidebarView("all");
        setAllFilesTreeExpanded(true);
      }
      setFolders(result.tree.folders);
      setFiles(result.tree.files);
      setCatalogCapabilities(
        resolveRuntimeCatalogCapabilities(result.tree.capabilities),
      );
      if (result.tree.scan?.state === "running" || result.tree.scan?.running) {
        setCatalogScanNotice("正在后台索引本地文件夹，文件会陆续出现…");
      } else if (result.tree.scan?.state === "error") {
        setCatalogScanNotice(
          result.tree.scan.error ?? "本地文件夹索引失败",
        );
      } else {
        setCatalogScanNotice(null);
      }
      writeFileListTreeCache(result.tree);
      const folderId = result.folder?.id ?? null;
      if (folderId) {
        setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
      }
      setError(null);
      return folderId;
    },
    [],
  );

  const addMappedFolder = useCallback(async () => {
    if (!catalogCapabilities.addMappedFolder || mappingBusy) {
      return;
    }
    setMappingBusy(true);
    try {
      const result = await addMappedFolderRoot();
      if (!result) {
        return;
      }
      const folderId = applyMappingRootResult(result);
      if (folderId) {
        setCurrentFolderId(folderId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMappingBusy(false);
    }
  }, [
    applyMappingRootResult,
    catalogCapabilities.addMappedFolder,
    mappingBusy,
  ]);

  const pickMappedFolderForSaveDialog = useCallback(async (): Promise<
    DiskFolderPickResult | null
  > => {
    if (!catalogCapabilities.addMappedFolder || mappingBusy) {
      return null;
    }
    setMappingBusy(true);
    try {
      const result = await addMappedFolderRoot();
      if (!result?.folder?.id) {
        return null;
      }
      applyMappingRootResult(result);
      return {
        folderId: result.folder.id,
        absPath: result.mappingRoot.absPath,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setMappingBusy(false);
    }
  }, [
    applyMappingRootResult,
    catalogCapabilities.addMappedFolder,
    mappingBusy,
  ]);

  const pickMappedFolderForDialog = useCallback(async (): Promise<
    string | null
  > => {
    if (!catalogCapabilities.addMappedFolder || mappingBusy) {
      return null;
    }
    setMappingBusy(true);
    try {
      const result = await addMappedFolderRoot();
      if (!result) {
        return null;
      }
      return applyMappingRootResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setMappingBusy(false);
    }
  }, [
    applyMappingRootResult,
    catalogCapabilities.addMappedFolder,
    mappingBusy,
  ]);

  const quickCreateFolder = useCallback(async () => {
    if (folderCreateInFlightRef.current) {
      return;
    }
    folderCreateInFlightRef.current = true;
    const parentId = isSelectedFolderId(currentFolderId, foldersById)
      ? currentFolderId
      : null;
    let name = "新建文件夹";
    let suffix = 1;
    const siblingNames = new Set(
      folders
        .filter((folder) => folderParentId(folder) === parentId)
        .map((folder) => folder.name),
    );
    while (siblingNames.has(name)) {
      name = `新建文件夹 (${suffix})`;
      suffix += 1;
    }
    try {
      debugFolderDnd("quick create folder start", {
        name,
        parentId: parentId ?? "__ROOT__",
        currentFolderId: currentFolderId ?? "__ROOT__",
      });
      const created = await ServerSync.createFolder(name, parentId);
      const siblingIds = [
        ...getOrderedFolderChildIds(parentId).filter((id) => id !== created.id),
        created.id,
      ];
      await ServerSync.saveOrder(
        parentId,
        siblingIds.map((id) => ({ type: "folder" as const, id })),
      );
      invalidateInflightRefresh();
      setFolders((prev) => {
        const next = [...prev, created];
        writeFileListTreeCache({ folders: next, files: filesRef.current });
        return next;
      });
      setExpandedFolders((prev) => ({
        ...prev,
        ...(parentId ? { [parentId]: true } : {}),
        [created.id]: true,
      }));
      setCurrentFolderId(created.id);
      debugFolderDnd("quick create folder done", { folderId: created.id });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err ?? "创建文件夹失败");
      debugFolderDnd("quick create folder failed", { message });
      setError(message);
    } finally {
      folderCreateInFlightRef.current = false;
    }
  }, [
    currentFolderId,
    folders,
    getOrderedFolderChildIds,
    invalidateInflightRefresh,
  ]);

  const isValidFolderDrop = useCallback(
    (
      sourceId: string,
      targetId: string | "__ROOT__",
      mode: "before" | "after" | "into",
    ): boolean => {
      if (targetId === "__ROOT__") {
        return mode === "into";
      }
      if (sourceId === targetId) {
        return false;
      }
      const source = foldersById.get(sourceId);
      if (source?.is_mapping_root) {
        if (targetId === "__ROOT__") {
          return mode === "into";
        }
        if (mode === "into") {
          return false;
        }
        const target = foldersById.get(targetId);
        return !!target && folderTreeParentId(target) === null;
      }
      const underSource = getDescendantFolderIds(sourceId, folders);
      if (mode === "into") {
        return !underSource.has(targetId);
      }
      const target = foldersById.get(targetId);
      if (!target) {
        return false;
      }
      const newParent = folderParentId(target);
      if (newParent === sourceId) {
        return false;
      }
      if (newParent != null && underSource.has(newParent)) {
        return false;
      }
      return true;
    },
    [folders, foldersById],
  );

  const clearFolderDragState = useCallback(() => {
    folderDndDebugKeyRef.current = null;
    setDraggingFolderId(null);
    setFolderDropInd(null);
  }, [setFolderDropInd]);

  const applyFolderDrop = useCallback(
    async (
      sourceId: string,
      targetId: string | "__ROOT__",
      mode: "before" | "after" | "into",
    ) => {
      if (!isValidFolderDrop(sourceId, targetId, mode)) {
        debugFolderDnd("apply drop rejected", {
          sourceId8: sourceId.slice(0, 8),
          targetId,
          mode,
        });
        return;
      }
      const toItems = (ids: string[]): FileOrderItem[] =>
        ids.map((id) => ({ type: "folder" as const, id }));

      try {
        debugFolderDnd("apply drop start", {
          sourceId8: sourceId.slice(0, 8),
          targetId,
          mode,
        });
        if (targetId === "__ROOT__") {
          const ids = getOrderedFolderChildIds(ROOT_ID).filter(
            (id) => id !== sourceId,
          );
          ids.push(sourceId);
          await ServerSync.saveOrder(ROOT_ID, toItems(ids));
        } else if (mode === "into") {
          const parentId = targetId;
          const ids = getOrderedFolderChildIds(parentId).filter(
            (id) => id !== sourceId,
          );
          ids.push(sourceId);
          await ServerSync.saveOrder(parentId, toItems(ids));
          setExpandedFolders((prev) => ({ ...prev, [parentId]: true }));
        } else {
          const target = foldersById.get(targetId);
          if (!target) {
            return;
          }
          const parentId = folderParentId(target);
          const ordered = getOrderedFolderChildIds(parentId).filter(
            (id) => id !== sourceId,
          );
          const tIdx = ordered.indexOf(targetId);
          if (tIdx < 0) {
            return;
          }
          const insertAt = mode === "before" ? tIdx : tIdx + 1;
          ordered.splice(insertAt, 0, sourceId);
          debugFolderDnd("apply drop reorder siblings", {
            parentId: parentId ?? "__ROOT__",
            insertAt,
            mode,
            orderedIds: ordered.map((id) => id.slice(0, 8)),
          });
          await ServerSync.saveOrder(parentId, toItems(ordered));
        }
        debugFolderDnd("apply drop done", {
          sourceId8: sourceId.slice(0, 8),
          targetId,
          mode,
        });
        await refresh({ silent: true });
      } catch (err: any) {
        debugFolderDnd("apply drop failed", {
          sourceId8: sourceId.slice(0, 8),
          targetId,
          mode,
          message: err?.message ?? String(err),
        });
        setError(err.message ?? "文件夹移动失败");
      }
    },
    [foldersById, getOrderedFolderChildIds, isValidFolderDrop, refresh],
  );

  const isFolderListDrag = (e: React.DragEvent) =>
    !!draggingFolderId || e.dataTransfer.types.includes(FOLDER_DND_MIME);

  const isSidebarFileDrop = (e: React.DragEvent) =>
    !isFolderListDrag(e) && e.dataTransfer.types.includes("Files");

  const readFolderDragSourceId = (e: React.DragEvent): string | null => {
    if (draggingFolderId) {
      return draggingFolderId;
    }
    try {
      const raw = e.dataTransfer.getData(FOLDER_DND_MIME);
      return raw || null;
    } catch {
      return null;
    }
  };

  const updateFolderRowIndicator = (e: React.DragEvent, folderId: string) => {
    const src = draggingFolderId;
    if (!src) {
      return;
    }
    if (src === folderId) {
      setFolderDropInd(null);
      e.dataTransfer.dropEffect = "none";
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientY - r.top) / Math.max(r.height, 1);
    /** 上缘或下缘（重叠区）均显示行间分隔线，避免中部「拖入」与 before/after 来回切换导致抖动。 */
    const nearTop = ratio < 0.55;
    const nearBottom = ratio > 0.45;
    const modes: ("before" | "after" | "into")[] =
      e.altKey && !(nearTop || nearBottom)
        ? ["into", "before", "after"]
        : nearTop || nearBottom
        ? ratio < 0.5
          ? ["before", "after"]
          : ["after", "before"]
        : ["before", "after", "into"];
    for (const mode of modes) {
      if (isValidFolderDrop(src, folderId, mode)) {
        e.dataTransfer.dropEffect = "move";
        setFolderDropInd({ targetId: folderId, mode });
        const debugKey = `${folderId}:${mode}`;
        if (folderDndDebugKeyRef.current !== debugKey) {
          folderDndDebugKeyRef.current = debugKey;
          debugFolderDnd("indicator", {
            sourceId8: src.slice(0, 8),
            targetId8: folderId.slice(0, 8),
            mode,
            ratio: Math.round(ratio * 1000) / 1000,
            nearTop,
            nearBottom,
            useSeparator: nearTop || nearBottom,
            altKey: e.altKey,
            rowHeight: Math.round(r.height),
          });
        }
        return;
      }
    }
    e.dataTransfer.dropEffect = "none";
    if (folderDndDebugKeyRef.current !== null) {
      folderDndDebugKeyRef.current = null;
      debugFolderDnd("indicator cleared", { targetId8: folderId.slice(0, 8) });
    }
    setFolderDropInd(null);
  };

  const onFolderHandleDragStart = (e: React.DragEvent, folderId: string) => {
    e.dataTransfer.setData(FOLDER_DND_MIME, folderId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingFolderId(folderId);
    debugFolderDnd("drag start", {
      sourceId8: folderId.slice(0, 8),
    });
  };

  const onFolderRowDragOver = (e: React.DragEvent, folder: ServerFolder) => {
    if (isSidebarFileDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      clearFileDropHover();
      setSidebarFileDropTargetId(folder.id);
      setFolderDropInd({ targetId: folder.id, mode: "into" });
      return;
    }
    if (!isFolderListDrag(e)) {
      return;
    }
    e.preventDefault();
    updateFolderRowIndicator(e, folder.id);
  };

  const onFolderRowDrop = (e: React.DragEvent, folder: ServerFolder) => {
    if (isSidebarFileDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      setSidebarFileDropTargetId(null);
      setFolderDropInd(null);
      const { files } = e.dataTransfer;
      if (!files?.length) {
        setError("未能读取拖入的文件，请重试。");
        return;
      }
      void handleSceneFiles(Array.from(files), {
        intent: { type: "import", folderId: folder.id },
      });
      return;
    }
    if (!isFolderListDrag(e)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const ind = folderDropIndicatorRef.current;
    const sourceId = readFolderDragSourceId(e);
    clearFolderDragState();
    if (!ind || !sourceId || ind.targetId !== folder.id) {
      debugFolderDnd("row drop ignored", {
        targetId8: folder.id.slice(0, 8),
        hasInd: !!ind,
        hasSource: !!sourceId,
        indTarget: ind?.targetId?.slice(0, 8) ?? null,
      });
      return;
    }
    debugFolderDnd("row drop", {
      sourceId8: sourceId.slice(0, 8),
      targetId8: folder.id.slice(0, 8),
      mode: ind.mode,
    });
    void applyFolderDrop(sourceId, folder.id, ind.mode);
  };

  const onRootRowDragOver = (e: React.DragEvent) => {
    if (!isFolderListDrag(e)) {
      return;
    }
    e.preventDefault();
    const src = draggingFolderId;
    if (!src) {
      return;
    }
    e.dataTransfer.dropEffect = isValidFolderDrop(src, "__ROOT__", "into")
      ? "move"
      : "none";
    if (e.dataTransfer.dropEffect === "move") {
      if (folderDndDebugKeyRef.current !== "__ROOT__:into") {
        folderDndDebugKeyRef.current = "__ROOT__:into";
        debugFolderDnd("indicator", {
          targetId: "__ROOT__",
          mode: "into",
          sourceId8: src.slice(0, 8),
        });
      }
      setFolderDropInd({ targetId: "__ROOT__", mode: "into" });
    } else {
      setFolderDropInd(null);
    }
  };

  const onRootRowDrop = (e: React.DragEvent) => {
    if (!isFolderListDrag(e)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const ind = folderDropIndicatorRef.current;
    const sourceId = readFolderDragSourceId(e);
    clearFolderDragState();
    if (!ind || ind.targetId !== "__ROOT__" || !sourceId) {
      debugFolderDnd("root drop ignored", {
        hasInd: !!ind,
        indTarget: ind?.targetId ?? null,
        hasSource: !!sourceId,
      });
      return;
    }
    debugFolderDnd("root drop", {
      sourceId8: sourceId.slice(0, 8),
      mode: "into",
    });
    void applyFolderDrop(sourceId, "__ROOT__", "into");
  };

  const onRecentRowDragOver = (e: React.DragEvent) => {
    if (!isSidebarFileDrop(e)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    clearFileDropHover();
    setSidebarFileDropTargetId("__RECENT__");
  };

  const onRecentRowDrop = (e: React.DragEvent) => {
    if (!isSidebarFileDrop(e)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setSidebarFileDropTargetId(null);
    const { files } = e.dataTransfer;
    if (!files?.length) {
      setError("未能读取拖入的文件，请重试。");
      return;
    }
    void handleSceneFiles(Array.from(files), {
      intent: { type: "track-recent" },
    });
  };

  // ── Render helpers ──

  const renderFolderTree = (parentId: string | null, depth = 0) => {
    const children = folders
      .filter((folder) => folderTreeParentId(folder) === parentId)
      .sort(compareManual);
    return children.map((folder) => {
      const hasChildren = folders.some(
        (f) => folderTreeParentId(f) === folder.id,
      );
      const expanded = expandedFolders[folder.id] ?? false;
      const active =
        sidebarView === "all" && currentFolderId === folder.id;
      const isDragging = draggingFolderId === folder.id;
      const ind = folderDropIndicator;
      const showBefore = ind?.targetId === folder.id && ind.mode === "before";
      const showAfter = ind?.targetId === folder.id && ind.mode === "after";
      const showInto =
        (ind?.targetId === folder.id && ind.mode === "into") ||
        sidebarFileDropTargetId === folder.id;
      return (
        <div key={folder.id} className="filelist__tree-node">
          <div
            className={[
              "filelist__tree-row-wrap",
              showInto ? "filelist__tree-row-wrap--into" : "",
              showBefore ? "filelist__tree-row-wrap--drop-before" : "",
              showAfter ? "filelist__tree-row-wrap--drop-after" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(e) => onFolderRowDragOver(e, folder)}
            onDrop={(e) => onFolderRowDrop(e, folder)}
          >
            <div
              className={[
                "filelist__tree-row",
                active ? "filelist__tree-row--active" : "",
                isDragging ? "filelist__tree-row--dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                depth > 0 ? { paddingLeft: `${depth * 0.75}rem` } : undefined
              }
              onContextMenu={(e) => openFolderContextMenu(e, folder)}
            >
              <span
                className="filelist__tree-drag-handle"
                draggable
                onDragStart={(e) => onFolderHandleDragStart(e, folder.id)}
                onDragEnd={clearFolderDragState}
                title="拖动排序；松手到上/下缘为插入线；按住 Alt 拖入为子文件夹"
              >
                <Icon type="drag" size={12} />
              </span>
              <button
                type="button"
                className="filelist__tree-toggle"
                onClick={(event) => {
                  event.stopPropagation();
                  traceIssueDiag(
                    "sidebar.tree",
                    expanded ? "toggle.collapse" : "toggle.expand",
                    {
                      folderId8: folder.id.slice(0, 8),
                      folderName: folder.name,
                      depth,
                      hasChildren,
                    },
                    "start",
                  );
                  setExpandedFolders((prev) => ({
                    ...prev,
                    [folder.id]: !expanded,
                  }));
                }}
                aria-label={expanded ? "折叠文件夹" : "展开文件夹"}
                aria-expanded={hasChildren ? expanded : undefined}
              >
                {hasChildren && (
                  <span
                    className={`filelist__tree-chevron ${
                      expanded ? "filelist__tree-chevron--open" : ""
                    }`}
                  >
                    <Icon type="chevron" size={14} />
                  </span>
                )}
              </button>
              <button
                type="button"
                className="filelist__tree-name"
                onClick={() => selectFolder(folder.id)}
              >
                <Icon type="folder" size={16} />
                <span>{folder.name}</span>
              </button>
            </div>
          </div>
          {expanded && renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  };

  const renderFolderContextMenu = () => {
    if (!folderContextMenu) {
      return null;
    }
    const folder = folderContextMenu.folder;
    const canOpenLocalFolder = isFolderUnderMappedRoot(folder);
    return (
      <div
        className="filelist__folder-context-menu"
        role="menu"
        style={{
          left: folderContextMenu.x,
          top: folderContextMenu.y,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {canOpenLocalFolder ? (
          <button
            type="button"
            role="menuitem"
            className="filelist__folder-context-menu-item"
            onClick={() => void openLocalFolder(folder)}
          >
            <Icon type="folder" size={15} />
            <span>打开本地文件夹</span>
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="filelist__folder-context-menu-item"
          onClick={() => startCreateFolderInParent(folder)}
        >
          <Icon type="plus" size={15} />
          <span>新建文件夹</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="filelist__folder-context-menu-item"
          onClick={() => startRenameFolder(folder)}
        >
          <Icon type="edit" size={15} />
          <span>重命名文件夹</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="filelist__folder-context-menu-item filelist__folder-context-menu-item--danger"
          onClick={() => void deleteFolder(folder)}
        >
          <Icon type="delete" size={15} />
          <span>{folder.is_mapping_root ? "移除映射" : "删除文件夹"}</span>
        </button>
      </div>
    );
  };

  const toggleAllFilesTree = useCallback(() => {
    setAllFilesTreeExpanded((open) => !open);
  }, []);

  const selectLocalDirectoryView = useCallback(() => {
    if (isFileListLayoutDebugEnabled()) {
      const data = {
        trigger: "selectLocalDirectoryView",
        fromSidebarView: sidebarViewRef.current,
        fromFolderId: currentFolderIdRef.current ?? "__ROOT__",
      };
      queueTopbarLayoutDebug("after selectLocalDirectoryView topbar layout", data);
      debugFileListLayout(
        "before selectLocalDirectoryView setState",
        collectLayoutDebugData(data),
      );
      traceTopbarLayoutFrames("selectLocalDirectoryView", data);
    }
    setSidebarView("all");
    setCurrentFolderId(null);
    setMobileTreeOpen(false);
  }, [
    collectLayoutDebugData,
    queueTopbarLayoutDebug,
    setCurrentFolderId,
    setSidebarView,
    traceTopbarLayoutFrames,
  ]);

  const renderSidebarNav = () => (
    <nav className="filelist__sidebar-menu" aria-label="文件列表分区">
      <div
        className={[
          "filelist__sidebar-menu-row",
          sidebarView === "recent"
            ? "filelist__sidebar-menu-row--active"
            : "",
          sidebarFileDropTargetId === "__RECENT__"
            ? "filelist__sidebar-menu-row--drop-into"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={onRecentRowDragOver}
        onDrop={onRecentRowDrop}
      >
        <button
          type="button"
          className={[
            "filelist__sidebar-menu-item",
            sidebarView === "recent"
              ? "filelist__sidebar-menu-item--active"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            if (isFileListLayoutDebugEnabled()) {
              const data = {
                trigger: "sidebarView-recent",
                fromSidebarView: sidebarViewRef.current,
                fromFolderId: currentFolderIdRef.current ?? "__ROOT__",
              };
              queueTopbarLayoutDebug("after sidebarView recent topbar layout", data);
              debugFileListLayout(
                "before sidebarView recent setState",
                collectLayoutDebugData(data),
              );
            }
            setSidebarView("recent");
          }}
        >
          <span className="filelist__sidebar-menu-icon" aria-hidden>
            <Icon type="clock" size={18} />
          </span>
          <span className="filelist__sidebar-menu-label">最近</span>
        </button>
      </div>

      <div className="filelist__sidebar-divider" role="separator" />

      <div className="filelist__sidebar-section">
        <div
          className={[
            "filelist__sidebar-menu-row",
            isLocalDirectoryRoot
              ? "filelist__sidebar-menu-row--active"
              : "",
            folderDropIndicator?.targetId === "__ROOT__" &&
            folderDropIndicator.mode === "into"
              ? "filelist__sidebar-menu-row--drop-into"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onDragOver={onRootRowDragOver}
          onDrop={onRootRowDrop}
        >
          <button
            type="button"
            className={[
              "filelist__sidebar-menu-item",
              isLocalDirectoryRoot
                ? "filelist__sidebar-menu-item--active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={selectLocalDirectoryView}
          >
            <span className="filelist__sidebar-menu-icon" aria-hidden>
              <Icon type="home" size={18} />
            </span>
            <span className="filelist__sidebar-menu-label">本地目录</span>
          </button>
          <button
            type="button"
            className="filelist__sidebar-menu-chevron"
            aria-expanded={allFilesTreeExpanded}
            aria-label={
              allFilesTreeExpanded ? "收起文件夹" : "展开文件夹"
            }
            onClick={toggleAllFilesTree}
          >
            <span
              className={[
                "filelist__sidebar-menu-chevron-icon",
                allFilesTreeExpanded
                  ? "filelist__sidebar-menu-chevron-icon--open"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Icon type="chevron" size={16} />
            </span>
          </button>
        </div>

        {allFilesTreeExpanded ? (
          <div className="filelist__sidebar-subtree">
            <button
              type="button"
              className="filelist__sidebar-subtree-action"
              disabled={mappingBusy}
              title={
                catalogCapabilities.addMappedFolder
                  ? "添加本地目录"
                  : "新建文件夹"
              }
              aria-label={
                catalogCapabilities.addMappedFolder
                  ? mappingBusy
                    ? "添加中"
                    : catalogScanNotice
                      ? "索引中"
                      : "添加本地目录"
                  : "新建文件夹"
              }
              onClick={() =>
                void (catalogCapabilities.addMappedFolder
                  ? addMappedFolder()
                  : quickCreateFolder())
              }
            >
              <Icon type="plus" size={16} aria-hidden />
              <span>
                {catalogCapabilities.addMappedFolder
                  ? mappingBusy
                    ? "添加中…"
                    : catalogScanNotice
                      ? "索引中…"
                      : "添加"
                  : "新建文件夹"}
              </span>
            </button>
            <div className="filelist__tree filelist__tree--nested">
              {renderFolderTree(ROOT_ID)}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );

  const renderSceneImportControl = () => {
    const isRecentOpen = sidebarView === "recent";
    const actionLabel = importing
      ? isRecentOpen
        ? "打开中…"
        : "导入中…"
      : isRecentOpen
      ? "打开"
      : "导入";
    const actionTitle = isRecentOpen
      ? `打开 ${editorRegistry.importableEditorNames()} 文档（添加到最近并进入编辑器）`
      : `导入 ${editorRegistry.importableEditorNames()} 文档到当前目录`;
    const buttonClass = isRecentOpen
      ? "filelist__import-scene-btn filelist__import-scene-btn--file filelist__topbar-open-btn filelist__topbar-primary-btn"
      : "filelist__import-scene-btn filelist__import-scene-btn--file";
    return (
    <label
      className={[
        "filelist__topbar-import",
        buttonClass,
        importing ? "filelist__import-scene-btn--busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-disabled={importing || undefined}
      aria-busy={importing || undefined}
      title={actionTitle}
    >
      <span className="filelist__import-scene-facade">
        <Icon type="upload" size={18} />
        {actionLabel}
      </span>
      <input
        id={FILELIST_SCENE_IMPORT_INPUT_ID}
        ref={sceneImportInputRef}
        type="file"
        multiple
        accept={editorRegistry.buildImportAccept()}
        className="filelist__file-input-overlay"
        onChange={onSceneImportInputChange}
        disabled={importing}
        tabIndex={-1}
      />
    </label>
    );
  };

  const renderBreadcrumbFilters = () => {
    if (sidebarView !== "all") {
      return null;
    }
    const showDefaultDataDirectoryToggle =
      isLocalDirectoryRoot && isDesktopEditorHub();
    const showFlatFolderToggle =
      isBrowsingSubfolder || !isDesktopEditorHub();

    if (!showDefaultDataDirectoryToggle && !showFlatFolderToggle) {
      return null;
    }

    return (
      <div className="filelist__filter-chips" role="group" aria-label="目录筛选">
        {showDefaultDataDirectoryToggle ? (
          <button
            type="button"
            className={[
              "filelist__filter-chip",
              defaultDataDirectoryOnlyView
                ? "filelist__filter-chip--active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={defaultDataDirectoryOnlyView}
            title={
              defaultDataDirectoryOnlyView
                ? "当前只看默认保存目录；点击显示全部本地目录"
                : "当前显示全部本地目录；点击只看默认保存目录"
            }
            onClick={() =>
              setDefaultDataDirectoryOnlyView(!defaultDataDirectoryOnlyView)
            }
          >
            {DEFAULT_DATA_DIRECTORY_ONLY_LABEL}
          </button>
        ) : null}
        {showFlatFolderToggle ? (
          <button
            type="button"
            className={[
              "filelist__filter-chip",
              flatFolderView ? "filelist__filter-chip--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={flatFolderView}
            title={
              flatFolderView
                ? "当前仅显示本文件夹直属文件"
                : "当前包含子文件夹文件；点击仅看直属文件"
            }
            onClick={() => setFlatFolderView(!flatFolderView)}
          >
            {FLAT_FOLDER_VIEW_LABEL}
          </button>
        ) : null}
      </div>
    );
  };

  const renderTopbarImport = () => renderSceneImportControl();

  const renderLocalDirectoryHub = () => {
    const openFolderLabel = catalogCapabilities.addMappedFolder
      ? mappingBusy
        ? "添加中…"
        : catalogScanNotice
        ? "索引中…"
        : "添加本地目录"
      : "新建文件夹";
    return (
      <div className="filelist__local-hub">
        <div className="filelist__local-hub-icon-wrap">
          <Icon type="home" size={64} />
        </div>
        <h2 className="filelist__local-hub-title">本地目录</h2>
        <p className="filelist__local-hub-desc">
          添加本地文件夹以浏览与管理文件，或新建文档。
        </p>
        <div className="filelist__local-hub-actions">
          <button
            type="button"
            className="filelist__local-hub-btn filelist__new-btn"
            onClick={() => openNewFileDialog()}
          >
            <Icon type="plus" size={18} />
            <span>新建</span>
          </button>
          <button
            type="button"
            className="filelist__local-hub-btn filelist__import-scene-btn"
            disabled={mappingBusy}
            onClick={() =>
              void (catalogCapabilities.addMappedFolder
                ? addMappedFolder()
                : quickCreateFolder())
            }
          >
            <Icon type="folder" size={18} />
            <span>{openFolderLabel}</span>
          </button>
        </div>
      </div>
    );
  };

  const renderSidebarTools = () => (
    <div className="filelist__sidebar-tools">
      <button
        type="button"
        className="filelist__sidebar-tool filelist__theme-btn"
        onClick={toggleShellTheme}
        title={shellTheme === "dark" ? "切换为亮色" : "切换为暗色"}
      >
        <Icon type={shellTheme === "dark" ? "sun" : "moon"} size={16} />
        <span>主题</span>
      </button>
      <button
        type="button"
        className="filelist__sidebar-tool filelist__settings-btn"
        onClick={() => setShowSettings(true)}
        title="设置"
      >
        <Icon type="settings" size={16} />
        <span>设置</span>
        <span
          className={`filelist__ai-dot ${
            aiDotOk ? "filelist__ai-dot--ok" : ""
          }`}
        />
      </button>
    </div>
  );

  const renderSidebarBrand = () =>
    !isDesktopEditorHub() ? (
      <div className="filelist__sidebar-brand">
        <ImageIcon src={MAIN_SITE_ICON} alt="" size={22} />
        <span className="filelist__sidebar-brand-title">{HOME_APP_TITLE}</span>
      </div>
    ) : null;

  const renderSidebar = () => (
    <aside
      className={[
        "filelist__sidebar filelist__sidebar--nav",
        isDesktopEditorHub() ? "filelist__sidebar--desktop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={sidebarRef}
    >
      {renderSidebarBrand()}
      <div className="filelist__sidebar-scroll">
        {renderSidebarNav()}
        {renderSidebarTools()}
      </div>
    </aside>
  );

  const renderNewEntryCard = (index: number) => (
    <div
      key="new-entry"
      className="filelist__card filelist__card--new"
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
      onClick={() => openNewFileDialog()}
    >
      <div className="filelist__card-thumb filelist__card-thumb--new">
        <span className="filelist__card-new-plus" aria-hidden>
          +
        </span>
      </div>
      <div className="filelist__card-body">
        <span className="filelist__card-name">新建</span>
      </div>
    </div>
  );

  const renderFileCard = (f: ServerFile, index: number) => {
    const isBrowserDraft = isLocalDraftFileId(f.id);
    const state = draftStateById[f.id];
    const syncState = state?.syncState ?? "synced";
    const preferLocalThumb = isBrowserDraft || syncState === "draft";
    const localDraftThumb = state?.localDraftThumb ?? null;
    const localThumb = localDraftThumb;
    const fetchedThumbContentSha = fetchedThumbs[f.id]
      ? (fetchedThumbHashByIdRef.current[f.id] ?? null)
      : null;
    const shouldUseDraftPreview = preferLocalThumb;
    const thumbnailChoice = chooseFileCardThumbnailForFile(
      f.id,
      f,
      fetchedThumbs[f.id] ?? null,
      fetchedThumbContentSha,
    );
    const thumbSvg = thumbnailChoice.thumbSvg;
    const kind = editorRegistry.resolveKind(f.kind);
    const thumbDisplay = resolveFileCardThumbDisplay(
      f.id,
      f,
      fetchedThumbs[f.id] ?? null,
      fetchedThumbContentSha,
      { showFetchLoading: visibleThumbIds.has(f.id) },
    );
    const cardThumbSvg = thumbDisplay.cardThumbSvg;
    if (syncState === "draft" || !thumbSvg) {
      debugFileListThumbnail("thumbnail choice", {
        id: f.id,
        id8: f.id.slice(0, 8),
        name: f.name,
        kind,
        syncState,
        shouldUseDraftPreview,
        hasServerThumbnailFlag: !!f.has_thumbnail,
        contentSha: f.content_sha256 ?? null,
        localThumbLen: localThumb?.length ?? 0,
        cachedDraftThumbLen: localDraftThumb?.length ?? 0,
        fetchedThumbLen: fetchedThumbs[f.id]?.length ?? 0,
        finalSource: thumbnailChoice.finalSource,
      });
    }
    if (
      kind === "mindmap" &&
      cardThumbSvg &&
      isFileListThumbnailDebugEnabled()
    ) {
      debugFileListThumbnail("mindmap thumbnail svg", {
        id: f.id,
        id8: f.id.slice(0, 8),
        name: f.name,
        syncState,
        finalSource: thumbnailChoice.finalSource,
        rawLen: thumbSvg?.length ?? 0,
        cardLen: cardThumbSvg.length,
        rawViewBox: getDebugSvgAttr(thumbSvg, "viewBox"),
        cardViewBox: getDebugSvgAttr(cardThumbSvg, "viewBox"),
        cardPreserveAspectRatio: getDebugSvgAttr(
          cardThumbSvg,
          "preserveAspectRatio",
        ),
        cardWidth: getDebugSvgAttr(cardThumbSvg, "width"),
        cardHeight: getDebugSvgAttr(cardThumbSvg, "height"),
        rawHasControls: {
          hover: /\bsmm-hover-node\b/i.test(thumbSvg ?? ""),
          quickCreate: /\bsmm-quick-create-child-btn\b/i.test(thumbSvg ?? ""),
          expand: /\bsmm-expand-btn\b/i.test(thumbSvg ?? ""),
          nodeAdd: /\bsmm-node-add\b/i.test(thumbSvg ?? ""),
          footer: /\bclass="[^"]*\bfooter\b[^"]*"/i.test(thumbSvg ?? ""),
        },
        cardHasControls: {
          hover: /\bsmm-hover-node\b/i.test(cardThumbSvg),
          quickCreate: /\bsmm-quick-create-child-btn\b/i.test(cardThumbSvg),
          expand: /\bsmm-expand-btn\b/i.test(cardThumbSvg),
          nodeAdd: /\bsmm-node-add\b/i.test(cardThumbSvg),
          footer: /\bclass="[^"]*\bfooter\b[^"]*"/i.test(cardThumbSvg),
        },
      });
    }
    const q = searchQuery.trim();
    const thumbLoading = thumbDisplay.thumbLoading;
    const thumbSwitchLoading = thumbDisplay.thumbSwitchLoading;
    const isRecentView = sidebarView === "recent";
    const recentAbsPath = isRecentView
      ? recentCatalogFileIdToAbsPath[f.id]
      : undefined;
    const recentPathStaleOnDisk =
      !!recentAbsPath && !!recentPathResolveFailed[recentAbsPath];
    const cardBadge =
      thumbSwitchLoading
        ? null
        : thumbDisplay.badge === "draft" || recentPathStaleOnDisk
          ? "draft"
          : thumbDisplay.badge;
    const canLocateFile =
      !isBrowserDraft &&
      isDesktopEditorHub() &&
      catalogCapabilities.folderMapping;
    const canMoveFileBetweenFolders =
      !isRecentView &&
      !isBrowserDraft &&
      catalogCapabilities.folderMapping;
    return (
      <div
        key={f.id}
        className="filelist__card"
        style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
        onClick={(ev) => {
          const t = ev.target as HTMLElement;
          if (consumeSuppressedCardOpen(f.id) || renamingId === f.id) {
            return;
          }
          if (t.closest(".filelist__card-action")) {
            return;
          }
          if (
            t.closest(".filelist__card-name") ||
            t.closest(".filelist__card-rename")
          ) {
            return;
          }
          logFileListOpen("card click → onOpenFile", {
            fileId8: f.id.slice(0, 8),
            kind,
            targetTag: t?.tagName,
            targetClass: String(t?.className || "").slice(0, 100),
          });
          handleOpenFile({ id: f.id, kind });
        }}
      >
        <FileCardThumb
          kind={kind}
          cardThumbSvg={cardThumbSvg}
          thumbLoading={thumbLoading}
          thumbSwitchLoading={thumbSwitchLoading}
          thumbBlank={thumbDisplay.thumbBlank}
          badge={cardBadge}
          thumbBg={thumbDisplay.thumbBg}
          ref={(node: HTMLDivElement | null) => thumbRefCallback(node, f.id)}
          data-thumb-file-id={f.id}
        >
          <div className="filelist__card-actions">
            {!isRecentView ? (
              <>
                <button
                  className="filelist__card-action"
                  title="重命名"
                  onPointerDown={() => suppressNextCardOpen(f.id)}
                  onClick={(e) => startRename(e, f.id, f.name)}
                >
                  <Icon type="edit" size={16} />
                </button>
                {canMoveFileBetweenFolders ? (
                  <button
                    className="filelist__card-action"
                    title="移动位置"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoveDialogExpandedFolders({});
                      setMoveDialogFile(f);
                      setMoveTargetFolderId(f.folder_id ?? null);
                    }}
                  >
                    <Icon type="move" size={16} />
                  </button>
                ) : null}
                {!isBrowserDraft && showWebOnlyFileActions ? (
                  <button
                    className="filelist__card-action"
                    title="嵌入到网页"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmbedFile(f);
                    }}
                  >
                    <Icon type="embed" size={16} />
                  </button>
                ) : null}
                {canLocateFile ? (
                  <button
                    className="filelist__card-action"
                    title="在文件管理器中显示"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openLocalFile(f);
                    }}
                  >
                    <Icon type="folder" size={16} />
                  </button>
                ) : !isBrowserDraft ? (
                  <button
                    className="filelist__card-action"
                    title="下载"
                    onClick={(e) => handleDownload(e, f.id, f.name)}
                  >
                    <Icon type="download" size={16} />
                  </button>
                ) : null}
                <button
                  className="filelist__card-action filelist__card-action--danger"
                  title="删除"
                  onClick={(e) => handleDelete(e, f)}
                >
                  <Icon type="delete" size={16} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="filelist__card-action"
                  title="重命名"
                  onPointerDown={() => suppressNextCardOpen(f.id)}
                  onClick={(e) => startRename(e, f.id, f.name)}
                >
                  <Icon type="edit" size={16} />
                </button>
                <button
                  className="filelist__card-action"
                  title="在文件管理器中显示"
                  disabled={!canLocateFile}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canLocateFile) {
                      void openLocalFile(f);
                    }
                  }}
                >
                  <Icon type="folder" size={16} />
                </button>
                <button
                  className="filelist__card-action"
                  title="移除"
                  onClick={(e) => handleRemoveFromRecent(e, f)}
                >
                  <Icon type="removeRecent" size={16} />
                </button>
              </>
            )}
          </div>
        </FileCardThumb>
        <div className="filelist__card-body">
          <div className="filelist__card-name-row">
            {renamingId === f.id ? (
              <input
                className="filelist__card-rename"
                value={renameValue}
                autoFocus
                onPointerDown={(e) => {
                  e.stopPropagation();
                  suppressNextCardOpen(f.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  suppressNextCardOpenRef.current = null;
                }}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(f.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitRename(f.id);
                  }
                  if (e.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
              />
            ) : (
              <span
                className="filelist__card-name"
                title={`${f.name} — 点击重命名`}
                onPointerDown={() => suppressNextCardOpen(f.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  logFileListOpen(
                    "card name click → startRename (same as rename button)",
                    {
                      fileId8: f.id.slice(0, 8),
                    },
                  );
                  startRename(e, f.id, f.name);
                }}
              >
                {highlightMatch(f.name, q)}
              </span>
            )}
          </div>
          <div className="filelist__card-meta">
            <span>{new Date(effectiveUpdatedAt(f)).toLocaleString()}</span>
            {catalogCapabilities.archivesEnabled &&
            (f.archive_count ?? 0) > 0 ? (
              <span className="filelist__card-badge">
                {f.archive_count} 存档
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const showLocalDirectoryHub = false;
  const showBootstrapSkeleton =
    (awaitingFirstFetch || loading) &&
    filteredFiles.length === 0 &&
    !showLocalDirectoryHub;
  const empty =
    !showBootstrapSkeleton &&
    filteredFiles.length === 0 &&
    !showNewEntryCard &&
    !showLocalDirectoryHub;

  const renderFileGrid = () => {
    const gridClassName = [
      "filelist__grid",
      gridEnterAnimate ? "filelist__grid--animate-children" : "",
      filteredFiles.length > 24 ? "filelist__grid--no-enter-animate" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={gridClassName} ref={gridRef} key={gridListKey}>
        {showNewEntryCard ? renderNewEntryCard(0) : null}
        {filteredFiles.map((f, i) =>
          renderFileCard(f, showNewEntryCard ? i + 1 : i),
        )}
      </div>
    );
  };

  /** Same nesting as sidebar tree: children under `parentId`, indent by `depth`. */
  const renderMoveTargetFolderTree = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode => {
    if (!moveDialogFile) {
      return null;
    }
    const currentF = moveDialogFile.folder_id ?? null;
    const childFolders = folders
      .filter((fo) => folderParentId(fo) === parentId)
      .sort(compareManual);
    return childFolders.map((folder) => {
      const isCurrent = currentF === folder.id;
      const isSelected = moveTargetFolderId === folder.id;
      const hasChildren = folders.some(
        (fo) => folderParentId(fo) === folder.id,
      );
      const expanded = moveDialogExpandedFolders[folder.id] ?? false;
      return (
        <div key={folder.id} className="filelist__move-tree-node">
          <div
            className="filelist__move-tree-row"
            style={
              depth > 0 ? { paddingLeft: `${depth * 0.85}rem` } : undefined
            }
          >
            <button
              type="button"
              className="filelist__move-tree-toggle"
              aria-label={expanded ? "折叠文件夹" : "展开文件夹"}
              aria-expanded={hasChildren ? expanded : undefined}
              disabled={!hasChildren}
              onClick={() => {
                if (!hasChildren) {
                  return;
                }
                setMoveDialogExpandedFolders((prev) => ({
                  ...prev,
                  [folder.id]: !expanded,
                }));
              }}
            >
              {hasChildren ? (
                <span
                  className={`filelist__move-tree-chevron ${
                    expanded ? "filelist__move-tree-chevron--open" : ""
                  }`}
                >
                  <Icon type="chevron" size={14} />
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={[
                "filelist__move-option",
                isSelected ? "filelist__move-option--active" : "",
                isCurrent ? "filelist__move-option--current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isCurrent}
              onClick={() => setMoveTargetFolderId(folder.id)}
            >
              <Icon type="folder" size={16} />
              <span className="filelist__move-option-label">
                {folder.name}
                {isCurrent ? "（当前位置）" : ""}
              </span>
            </button>
          </div>
          {expanded && hasChildren
            ? renderMoveTargetFolderTree(folder.id, depth + 1)
            : null}
        </div>
      );
    });
  };


  const fileListToasts = useMemo(() => {
    const items: {
      id: string;
      message: string;
      variant: "notice" | "error";
      persistent?: boolean;
    }[] = [];
    if (catalogScanNotice) {
      items.push({
        id: "catalog-scan",
        message: catalogScanNotice,
        variant: "notice",
        persistent: true,
      });
    }
    if (importNotice) {
      items.push({
        id: "import-notice",
        message: importNotice,
        variant: "notice",
      });
    }
    if (error) {
      items.push({
        id: "error",
        message: error,
        variant: "error",
      });
    }
    return items;
  }, [catalogScanNotice, error, importNotice]);

  return (
    <div
      className={[
        "filelist",
        shellThemeClassName(shellTheme),
        isDesktopEditorHub() ? "filelist--desktop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {importing && (
        <div className="filelist__import-blocking" aria-busy>
          <div className="filelist__import-card" role="status">
            <span className="filelist__import-spinner" aria-hidden />
            <span className="filelist__import-title">正在导入</span>
            <span className="filelist__import-desc">
              正在解析文件并生成预览，请稍候
            </span>
          </div>
        </div>
      )}

      {renderSidebar()}

      <div
        className="filelist__workspace"
        onDragEnter={onFileListImportDragEnter}
        onDragLeave={onFileListImportDragLeave}
        onDragOver={onFileListImportDragOver}
        onDrop={onFileListImportDrop}
      >
        {fileDropHoverActive && !importing ? (
          <div className="filelist__drop-overlay" aria-hidden>
            <span className="filelist__drop-overlay-label">
              {workspaceDropOverlayLabel}
            </span>
          </div>
        ) : null}

        <header className="filelist__topbar" ref={topbarRef}>
          <button
            type="button"
            className="filelist__mobile-menu"
            onClick={() => setMobileTreeOpen(true)}
            aria-label="打开导航"
          >
            <Icon type="menu" size={20} />
          </button>
          <div className="filelist__pathbar">
            <div className="filelist__breadcrumbs">
              {sidebarView === "recent" ? (
                <span className="filelist__pathbar-label">最近</span>
              ) : (
                <>
                  <button type="button" onClick={() => selectLocalDirectoryView()}>
                    本地目录
                  </button>
                  {defaultDataDirectoryOnlyView &&
                  isLocalDirectoryRoot &&
                  defaultDataDirectoryFolderId ? (
                    <>
                      <span>/</span>
                      <button
                        type="button"
                        onClick={() => selectFolder(defaultDataDirectoryFolderId)}
                      >
                        {foldersById.get(defaultDataDirectoryFolderId)?.name ??
                          DEFAULT_DATA_DIRECTORY_ONLY_LABEL}
                      </button>
                    </>
                  ) : null}
                  {currentPath.map((folder) => (
                    <React.Fragment key={folder.id}>
                      <span>/</span>
                      <button
                        type="button"
                        onClick={() => selectFolder(folder.id)}
                      >
                        {folder.name}
                      </button>
                    </React.Fragment>
                  ))}
                </>
              )}
            </div>
            {renderBreadcrumbFilters()}
          </div>
          <div className="filelist__topbar-actions">
            <div className="filelist__search-wrap">
              <span className="filelist__search-icon">
                <Icon type="search" size={16} />
              </span>
              <input
                className="filelist__search"
                type="search"
                placeholder="搜索文件名…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="搜索文件"
              />
            </div>
            <label className="filelist__sort">
              <span className="filelist__sort-label">排序</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="updated_at">修改时间</option>
                <option value="created_at">创建时间</option>
                <option value="name">名称</option>
              </select>
            </label>
            {renderTopbarImport()}
          </div>
        </header>

        <div className="filelist__body" ref={mainRef}>
          {showBootstrapSkeleton ? (
            <div className="filelist__grid" ref={gridRef}>
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="filelist__skeleton-card"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="filelist__skeleton-thumb" />
                  <div className="filelist__skeleton-body">
                    <div className="filelist__skeleton-line" />
                    <div className="filelist__skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          ) : showLocalDirectoryHub ? (
            renderLocalDirectoryHub()
          ) : empty ? (
            <div className="filelist__empty">
              <div className="filelist__empty-icon-wrap">
                <Icon type="file" size={64} />
              </div>
              <p className="filelist__empty-text">
                {searchQuery
                  ? "没有匹配的文件"
                  : sidebarView === "recent"
                  ? "最近 7 天内暂无打开记录"
                  : "当前文件夹为空"}
              </p>
            </div>
          ) : (
            renderFileGrid()
          )}
        </div>
      </div>

      {mobileTreeOpen && (
        <div className="filelist__mobile-sheet" role="dialog" aria-modal>
          <div
            className="filelist__mobile-sheet-backdrop"
            {...mobileTreeBackdropDismiss}
          />
          <div className="filelist__mobile-sheet-panel">
            <div className="filelist__mobile-sheet-head">
              <strong>选择文件夹</strong>
              <button
                type="button"
                className="filelist__card-action"
                onClick={() => setMobileTreeOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="filelist__mobile-sheet-sidebar">
              {renderSidebarBrand()}
              <div className="filelist__sidebar-scroll">
                {renderSidebarNav()}
                {renderSidebarTools()}
              </div>
            </div>
          </div>
        </div>
      )}

      {renderFolderContextMenu()}

      {folderDraft && (
        <ShellDialogOverlay
          theme={shellTheme}
          role="dialog"
          aria-modal
          overlayDismiss={folderDraftOverlayDismiss}
        >
          <div
            className="filelist__detail-card filelist__new-file-dialog"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 className="filelist__detail-title">
              {folderDraft.mode === "create" ? "新建文件夹" : "重命名文件夹"}
            </h2>
            <input
              className="filelist__folder-input"
              value={folderNameValue}
              autoFocus
              onChange={(e) => setFolderNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void commitFolderDraft();
                }
                if (e.key === "Escape") {
                  setFolderDraft(null);
                }
              }}
            />
            <div className="filelist__detail-actions">
              <button
                type="button"
                className="filelist__new-btn"
                onClick={() => void commitFolderDraft()}
              >
                保存
              </button>
              <button
                type="button"
                className="filelist__import-scene-btn"
                onClick={() => setFolderDraft(null)}
              >
                取消
              </button>
            </div>
          </div>
        </ShellDialogOverlay>
      )}

      {folderDeleteTarget ? (
        <FileListConfirmDialog
          open={!!folderDeleteTarget}
          title={
            folderDeleteTarget.is_mapping_root ? "移除映射" : "删除文件夹"
          }
          message={
            folderDeleteTarget.is_mapping_root
              ? `移除映射文件夹「${folderDeleteTarget.name}」？本地磁盘上的文件夹和文件不会被删除。`
              : `删除文件夹「${folderDeleteTarget.name}」？文件会移动到根目录，子文件夹会被删除。`
          }
          confirmLabel={
            folderDeleteTarget.is_mapping_root ? "移除映射" : "删除文件夹"
          }
          busy={folderDeleteBusy}
          onCancel={dismissFolderDeleteDialog}
          onConfirm={() => void confirmDeleteFolder()}
        />
      ) : null}

      {fileDeleteTarget ? (
        <FileListConfirmDialog
          open={!!fileDeleteTarget}
          title="删除文件"
          message={`确定删除「${fileDeleteTarget.name}」？`}
          confirmLabel="删除"
          busy={fileDeleteBusy}
          onCancel={dismissFileDeleteDialog}
          onConfirm={() => void confirmDeleteFile()}
        />
      ) : null}

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <NewFileDialog
        open={newFileDialogOpen}
        overlayDismiss={newFileOverlayDismiss}
        onClose={dismissNewFileDialog}
        onCommit={commitNewDocumentPick}
      />

      <SaveNewDocumentDialog
        open={formalCreateKind != null}
        saving={formalCreateSaving}
        overlayDismiss={formalCreateOverlayDismiss}
        defaultName={
          formalCreateKind
            ? defaultNameForDocumentKind(formalCreateKind)
            : "未命名"
        }
        documentKind={formalCreateKind ?? undefined}
        presetFolderId={
          typeof newDocumentFolderId === "string" &&
          newDocumentFolderId.length > 0
            ? newDocumentFolderId
            : undefined
        }
        title="新建文件"
        allowOpenLocalFolder={catalogCapabilities.addMappedFolder}
        openLocalFolderBusy={mappingBusy}
        onOpenLocalFolder={pickMappedFolderForSaveDialog}
        onClose={dismissFormalCreateDialog}
        onSave={commitFormalCreate}
      />

      <EditorKindDialog
        open={importKindDialogOpen}
        title="导入"
        hint={
          importPickerFileName
            ? `选择用于打开「${importPickerFileName}」的编辑器`
            : "选择用于导入的编辑器"
        }
        plugins={importKindPlugins}
        overlayDismiss={importKindOverlayDismiss}
        onClose={dismissImportKindDialog}
        onCommit={commitImportKindPick}
      />

      {moveDialogFile && (
        <ShellDialogOverlay
          theme={shellTheme}
          role="dialog"
          aria-modal
          overlayDismiss={moveDialogOverlayDismiss}
        >
          <div
            className="filelist__detail-card filelist__move-dialog"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 className="filelist__detail-title">
              移动「{moveDialogFile.name}」
            </h2>
            <p className="filelist__new-file-hint">选择要移动到的文件夹</p>
            <div
              className="filelist__move-list"
              role="list"
              aria-label="文件夹列表"
            >
              {renderMoveTargetFolderTree(ROOT_ID, 0)}
            </div>
            <div className="filelist__detail-actions">
              <button
                type="button"
                className="filelist__new-btn"
                disabled={
                  moveTargetFolderId === (moveDialogFile.folder_id ?? null)
                }
                onClick={() => void commitMove()}
              >
                移动
              </button>
              <button
                type="button"
                className="filelist__import-scene-btn"
                onClick={() => setMoveDialogFile(null)}
              >
                取消
              </button>
            </div>
          </div>
        </ShellDialogOverlay>
      )}

      {importFolderPickerOpen ? (
        <ImportDestinationDialog
          open={importFolderPickerOpen}
          importing={importing}
          mappingBusy={mappingBusy}
          files={importFolderPickerFiles}
          accept={editorRegistry.buildImportAccept()}
          selectedFolderId={importFolderPickerTargetId}
          showAddLocalFolder={catalogCapabilities.addMappedFolder}
          overlayDismiss={importFolderPickerOverlayDismiss}
          onSelectFolder={setImportFolderPickerTargetId}
          onPickFiles={handleImportDialogPickFiles}
          onAddLocalFolder={pickMappedFolderForDialog}
          onConfirm={() => void commitImportFolderPicker()}
          onCancel={dismissImportFolderPicker}
        />
      ) : null}

      {showWebOnlyFileActions ? (
        <EmbedTokenManager
          fileId={embedFile?.id ?? ""}
          fileName={embedFile?.name ?? ""}
          open={!!embedFile}
          onClose={() => setEmbedFile(null)}
        />
      ) : null}

      <DocumentPreviewDialog
        fileId={previewFile?.id ?? ""}
        fileName={previewFile?.name ?? ""}
        kind={previewFile?.kind ?? "mindmap"}
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />

      <FileListToastStack
        items={fileListToasts}
        onDismiss={(id) => {
          if (id === "error") {
            setError(null);
          }
        }}
      />
    </div>
  );
}
