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
import {
  applyMainSiteDocumentBranding,
  editorIconForKind,
  HOME_APP_TITLE,
  MAIN_SITE_ICON,
} from "../lib/appBranding";
import { createLogger, logFileListOpen } from "../lib/logger";
import {
  devDebug,
  isDevDebugChannelEnabled,
  isFileListFolderDndDebugEnabled,
} from "../lib/devDebug";
import {
  readFileListTreeCache,
  writeFileListTreeCache,
} from "../data/fileListSessionCache";
import { FileSyncState } from "../data/FileSyncState";
import { resolveFileCardThumbDisplay } from "../data/fileCardThumbDisplay";
import { chooseFileCardThumbnail } from "../data/fileCardThumbnail";
import {
  formatImportErrorMessage,
} from "../data/importExcalidrawScene";
import { LocalThumbnailCache, LOCAL_THUMB_UPDATED_EVENT } from "../data/localThumbnailCache";
import { detectImportCandidateKinds } from "../data/detectImportCandidates";
import { FileCardThumb } from "../components/FileCardThumb";
import { EditorKindDialog, NewFileDialog } from "../components/NewFileDialog";
import { SaveNewDocumentDialog } from "../components/PromoteTempFileDialog";
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
  getRecentFileEntries,
  RECENT_FILES_CHANGE_EVENT,
  recordRecentFileAccess,
} from "../data/recentFiles";
import { editorRegistry } from "../editors";
import type { EditorPlugin } from "../editors/types";
import {
  ServerSync,
  type FileOrderItem,
  type ServerFile,
  type ServerFolder,
} from "../data/ServerSync";
import {
  ensureAIConfigLoaded,
  isAIConfigured,
  subscribeAIConfig,
} from "../data/aiConfig";
import { computeThumbFetchAllowIds } from "../data/thumbCoverage";
import { EmbedTokenManager } from "../components/EmbedTokenManager";
import { SettingsPanel } from "../components/SettingsPanel";

import { useThumbnailPipeline } from "./useThumbnailPipeline";

import "../components/FileList.scss";

const logList = createLogger({ module: "fileList" });
const logThumb = createLogger({ module: "thumbnail" });
const logPipe = createLogger({ module: "thumbPipeline" });


function getDebugSvgAttr(svgMarkup: string | null, name: string): string | null {
  if (!svgMarkup) {
    return null;
  }
  return (
    svgMarkup
      .match(/<svg\b[^>]*>/i)?.[0]
      .match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? null
  );
}

function isFileListThumbnailDebugEnabled(): boolean {
  if (isDevDebugChannelEnabled("file-list")) {
    return true;
  }
  try {
    return localStorage.getItem("excalidraw-filelist-thumbnail-debug") === "1";
  } catch {
    return false;
  }
}

function isFileListLayoutDebugEnabled(): boolean {
  if (isDevDebugChannelEnabled("file-list")) {
    return true;
  }
  try {
    return localStorage.getItem("excalidraw-filelist-layout-debug") === "1";
  } catch {
    return false;
  }
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

function roundedNumber(value: number): number {
  return Math.round(value * 100) / 100;
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

function computedLayoutInfo(el: Element | null): Record<string, unknown> | null {
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

function findThumbNode(root: HTMLElement | null, fileId: string | null): HTMLElement | null {
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
  onOpenFile: (file: { id: string; kind?: string }) => void;
  onReady?: () => void;
}

type SortKey = "updated_at" | "created_at" | "name";
type FolderDraft =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: ServerFolder };

const ROOT_ID: string | null = null;

type SidebarView = "recent" | "all";
const SIDEBAR_VIEW_STORAGE_KEY = "editorhub-filelist-sidebar-view";

const FILELIST_SCENE_IMPORT_INPUT_ID = "filelist-scene-import-input";
/** HTML5 DnD payload for internal folder reparenting / reorder (sidebar only). */
const FOLDER_DND_MIME = "application/x-excalidraw-fork-folder";

function sanitizeFileBaseName(name: string): string {
  const base =
    name.replace(/\.(excalidraw|smm|json|png|svg)$/i, "").trim() || "Imported";
  return base.slice(0, 120);
}

/** 从拖放/多选里筛出可能导入的文档：扩展名 或 典型 MIME。不再「无 type 就全收」，免杂文件进导入。 */
const IMPORTABLE_NAME = /\.(excalidraw|excalidrawlib|smm|txt|json|png|svg|jpe?g)$/i;
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

/** 多文件导入中途失败时回滚；返回**未能**删除的 id（或网络失败）。 */
async function rollbackCreatedImportFiles(createdIds: string[]): Promise<string[]> {
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

function compareManual(a: { sort_index?: number; name: string }, b: { sort_index?: number; name: string }) {
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
    | "menu"
    | "sort"
    | "move"
    | "drag"
    | "embed"
    | "settings",
) {
  const paths = {
    folder:
      "M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z",
    file:
      "M6 2h8l4 4v16H6V2zm7 1.5V7h3.5",
    grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
    home:
      "M12 3l9 8h-2v9h-5v-6h-4v6H5v-9H3l9-8z",
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
    delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    menu: "M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z",
    sort: "M7 4h10v2H7V4zm-3 7h16v2H4v-2zm5 7h6v2H9v-2z",
    drag: "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    move:
      "M4 12l4-4v3h3v2H8v3l-4-4zM12 7l2 2h7c1.1 0 2 .9 2 2v9H12V7z",
    embed:
      "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
    settings:
      "M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z",
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

function getInitialFileListStateFromCache(): {
  files: ServerFile[];
  folders: ServerFolder[];
  loading: boolean;
} {
  const cached = readFileListTreeCache();
  if (!cached) {
    return { files: [], folders: [], loading: true };
  }
  return {
    files: cached.files,
    folders: cached.folders,
    loading: false,
  };
}

export function useFileListController({ onOpenFile, onReady }: FileListProps) {
  const handleOpenFile = useCallback(
    (opts: { id: string; kind: string }) => {
      recordRecentFileAccess(opts.id);
      onOpenFile(opts);
    },
    [onOpenFile],
  );

  useEffect(() => {
    purgeLegacyTempArtifacts();
    applyMainSiteDocumentBranding();
  }, []);

  const initialList = getInitialFileListStateFromCache();
  const [files, setFiles] = useState<ServerFile[]>(initialList.files);
  const [folders, setFolders] = useState<ServerFolder[]>(initialList.folders);
  const [currentFolderId, setCurrentFolderIdRaw] = useState<string | null>(() => {
    try {
      const saved = sessionStorage.getItem("excalidraw-filelist-folder");
      return saved || ROOT_ID;
    } catch {
      return ROOT_ID;
    }
  });
  const setCurrentFolderId = useCallback((id: string | null) => {
    setCurrentFolderIdRaw(id);
    try {
      if (id) {
        sessionStorage.setItem("excalidraw-filelist-folder", id);
      } else {
        sessionStorage.removeItem("excalidraw-filelist-folder");
      }
    } catch { /* ignore */ }
  }, []);
  const [sidebarView, setSidebarViewRaw] = useState<SidebarView>(() => {
    try {
      const saved = sessionStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
      return saved === "all" ? "all" : "recent";
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
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [allFilesTreeExpanded, setAllFilesTreeExpanded] = useState(true);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [loading, setLoading] = useState(initialList.loading);
  const [error, setError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fetchedThumbs, setFetchedThumbs] = useState<Record<string, string>>({});
  const fetchedThumbsRef = useRef(fetchedThumbs);
  fetchedThumbsRef.current = fetchedThumbs;
  const fetchedThumbHashByIdRef = useRef<Record<string, string | null>>({});
  const fileThumbHashByIdRef = useRef<Record<string, string | null>>({});
  const [visibleThumbIds, setVisibleThumbIds] = useState<Set<string>>(
    () => new Set(),
  );
  const sceneImportInputRef = useRef<HTMLInputElement>(null);
  const thumbObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbNodeMap = useRef<Map<string, HTMLElement>>(new Map());
  const sidebarRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pendingLayoutDebugRef = useRef<{
    label: string;
    data: Record<string, unknown>;
  } | null>(null);
  const previousFetchedThumbIdsRef = useRef<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const suppressNextCardOpenRef = useRef<string | null>(null);
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [folderNameValue, setFolderNameValue] = useState("");
  const [syncVersion, setSyncVersion] = useState(0);
  const [sortKey, setSortKeyRaw] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem("excalidraw-filelist-sort");
      if (saved === "updated_at" || saved === "created_at" || saved === "name") {
        return saved;
      }
    } catch { /* ignore */ }
    return "updated_at";
  });
  const setSortKey = useCallback((key: SortKey) => {
    setSortKeyRaw(key);
    try { localStorage.setItem("excalidraw-filelist-sort", key); } catch { /* ignore */ }
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [aiDotOk, setAiDotOk] = useState(false);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [formalCreateKind, setFormalCreateKind] = useState<string | null>(null);
  const [formalCreateSaving, setFormalCreateSaving] = useState(false);
  const formalCreateInFlightRef = useRef(false);
  const folderCreateInFlightRef = useRef(false);
  const [importKindDialogOpen, setImportKindDialogOpen] = useState(false);
  const [importKindPlugins, setImportKindPlugins] = useState<EditorPlugin[]>([]);
  const [importPickerFileName, setImportPickerFileName] = useState<string | null>(
    null,
  );
  const importQueueRef = useRef<File[]>([]);
  const pendingImportFileRef = useRef<File | null>(null);

  const [moveDialogFile, setMoveDialogFile] = useState<ServerFile | null>(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [embedFile, setEmbedFile] = useState<ServerFile | null>(null);

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
  const dismissNewFileDialog = useCallback(() => setNewFileDialogOpen(false), []);
  const dismissMoveDialog = useCallback(() => setMoveDialogFile(null), []);
  const dismissMobileTree = useCallback(() => setMobileTreeOpen(false), []);
  const folderDraftOverlayDismiss = useStrictOverlayDismiss(dismissFolderDraft);
  const newFileOverlayDismiss = useStrictOverlayDismiss(dismissNewFileDialog);
  const moveDialogOverlayDismiss = useStrictOverlayDismiss(dismissMoveDialog);
  const mobileTreeBackdropDismiss = useStrictOverlayDismiss(dismissMobileTree);

  const searchActive = !!searchQuery.trim();

  useEffect(() => {
    const bumpRecent = () => setRecentRevision((value) => value + 1);
    window.addEventListener(RECENT_FILES_CHANGE_EVENT, bumpRecent);
    window.addEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bumpRecent);
    window.addEventListener("excalidraw-file-list-refresh", bumpRecent);
    window.addEventListener("excalidraw-file-sync-state", bumpRecent);
    return () => {
      window.removeEventListener(RECENT_FILES_CHANGE_EVENT, bumpRecent);
      window.removeEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bumpRecent);
      window.removeEventListener("excalidraw-file-list-refresh", bumpRecent);
      window.removeEventListener("excalidraw-file-sync-state", bumpRecent);
    };
  }, []);

  useEffect(() => {
    const syncAiDot = () => setAiDotOk(isAIConfigured());
    ensureAIConfigLoaded().then(syncAiDot).catch(syncAiDot);
    return subscribeAIConfig(syncAiDot);
  }, []);

  useEffect(() => {
    const nextHashes: Record<string, string | null> = {};
    for (const file of files) {
      nextHashes[file.id] = file.content_sha256 ?? null;
    }
    fileThumbHashByIdRef.current = nextHashes;

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
  }, [files]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const newIds: string[] = [];
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const fileId = (entry.target as HTMLElement).dataset.thumbFileId;
            if (fileId) {
              newIds.push(fileId);
              observer.unobserve(entry.target);
              thumbNodeMap.current.delete(fileId);
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
      { rootMargin: "400px" },
    );
    thumbObserverRef.current = observer;
    return () => {
      observer.disconnect();
      thumbObserverRef.current = null;
    };
  }, []);

  const thumbRefCallback = useCallback((node: HTMLElement | null, fileId: string) => {
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
  }, []);

  useEffect(() => {
    const bump = () => setSyncVersion((n) => n + 1);
    window.addEventListener("excalidraw-file-sync-state", bump);
    window.addEventListener("excalidraw-server-saved", bump);
    window.addEventListener(LOCAL_THUMB_UPDATED_EVENT, bump);
    window.addEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("excalidraw-file-sync-state", bump);
      window.removeEventListener("excalidraw-server-saved", bump);
      window.removeEventListener(LOCAL_THUMB_UPDATED_EVENT, bump);
      window.removeEventListener(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const inflightRef = useRef<AbortController | null>(null);
  const refreshSeqRef = useRef(0);
  const filesRef = useRef(files);
  filesRef.current = files;
  const currentFolderIdRef = useRef(currentFolderId);
  currentFolderIdRef.current = currentFolderId;

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

  const refresh = useCallback(
    async (options?: { silent?: boolean; noErrorOnFailure?: boolean }) => {
      if (inflightRef.current) {
        inflightRef.current.abort();
      }
      const seq = ++refreshSeqRef.current;
      const ac = new AbortController();
      inflightRef.current = ac;
      try {
        if (!options?.silent) {
          setLoading(true);
        }
        logList.debug("refresh start");
        const tree = await ServerSync.listFileTree({ signal: ac.signal });
        if (ac.signal.aborted || seq !== refreshSeqRef.current) {
          return;
        }
        setFolders(tree.folders);
        setFiles(tree.files);
        setExpandedFolders((prev) => {
          const next = { ...prev };
          for (const folder of tree.folders) {
            if (next[folder.id] === undefined) {
              next[folder.id] = true;
            }
          }
          return next;
        });
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
        // Use ref to read latest currentFolderId without it being a dep,
        // preventing unwanted re-fetches when folder navigation triggers a
        // setCurrentFolderId here (which would create a dep-change loop).
        const fid = currentFolderIdRef.current;
        if (fid && !tree.folders.some((f) => f.id === fid)) {
          setCurrentFolderId(ROOT_ID);
        }
        logList.debug("refresh done", {
          folders: tree.folders.length,
          count: tree.files.length,
          withThumb: tree.files.filter((x) => x.has_thumbnail).length,
          withSha: tree.files.filter((x) => x.content_sha256).length,
        });
        setError(null);
        setImportNotice(null);
        writeFileListTreeCache(tree);
        onReady?.();
      } catch (e: any) {
        if (ac.signal.aborted || seq !== refreshSeqRef.current) {
          return;
        }
        logList.debug("refresh error", e);
        if (options?.noErrorOnFailure) {
          onReady?.();
          throw e;
        }
        setError(e.message || "Failed to load files");
        onReady?.();
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
      }
    },
    [onReady],
  );

  useEffect(() => {
    const onListRefresh = () => {
      logList.debug("excalidraw-file-list-refresh -> refresh(silent)");
      void refresh({ silent: true });
    };
    window.addEventListener("excalidraw-file-list-refresh", onListRefresh);
    return () =>
      window.removeEventListener("excalidraw-file-list-refresh", onListRefresh);
  }, [refresh]);

  useEffect(() => {
    void refresh({ silent: !!readFileListTreeCache() });
  }, [refresh]);

  const currentPath = useMemo(
    () => buildFolderPath(currentFolderId, foldersById),
    [currentFolderId, foldersById],
  );

  const draftStateById = useMemo(() => {
    const slotFor = (fileId: string) => {
      const syncState = FileSyncState.getSyncState(fileId);
      const preferLocalThumb =
        isLocalDraftFileId(fileId) || syncState === "draft";
      return {
        syncState,
        baseHash: FileSyncState.getBaselineHash(fileId),
        draftHash: FileSyncState.getDraftHash(fileId),
        localDraftThumb: preferLocalThumb
          ? LocalThumbnailCache.get(fileId)
          : null,
      };
    };
    const byId: Record<
      string,
      ReturnType<typeof slotFor>
    > = {};
    for (const f of files) {
      byId[f.id] = slotFor(f.id);
    }
    for (const draft of LocalDraftSessions.listIndexed()) {
      if (!byId[draft.id]) {
        byId[draft.id] = slotFor(draft.id);
      }
    }
    return byId;
  }, [files, syncVersion]);

  const effectiveUpdatedAt = useCallback((f: ServerFile): string => {
    const local = FileSyncState.getLocalEditTime(f.id);
    if (!local) {
      return f.updated_at;
    }
    return new Date(local).getTime() > new Date(f.updated_at).getTime()
      ? local
      : f.updated_at;
  }, []);

  const descendantFolderIds = useMemo(
    () => getDescendantFolderIds(currentFolderId, folders),
    [currentFolderId, folders],
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

  const recentDisplayFiles = useMemo(() => {
    const resolved: ServerFile[] = [];
    for (const entry of getRecentFileEntries()) {
      if (isLocalDraftFileId(entry.id)) {
        const file =
          filesById.get(entry.id) ??
          (LocalDraftSessions.get(entry.id)
            ? draftSessionToServerFile(
                LocalDraftSessions.get(entry.id)!,
              )
            : null);
        if (file) {
          resolved.push(file);
        }
        continue;
      }
      const file = filesById.get(entry.id);
      if (file) {
        resolved.push(file);
      }
    }
    return resolved;
  }, [filesById, recentRevision]);

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
        return fid === currentFolderId || descendantFolderIds.has(fid as string);
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
    descendantFolderIds,
    effectiveUpdatedAt,
    files,
    recentDisplayFiles,
    searchQuery,
    sidebarView,
    sortKey,
  ]);

  const collectLayoutDebugData = useCallback(
    (data: Record<string, unknown> = {}) => {
      const sidebar = sidebarRef.current;
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
          : "所有文件",
        files: files.length,
        filteredFiles: filteredFiles.length,
        fetchedThumbs: Object.keys(fetchedThumbsRef.current).length,
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
      if (!isFileListLayoutDebugEnabled()) {
        setFetchedThumbs(nextState);
        return;
      }

      setFetchedThumbs((prev) => {
        const next =
          typeof nextState === "function"
            ? nextState(prev)
            : nextState;
        const prevIds = new Set(Object.keys(prev));
        const nextIds = Object.keys(next);
        const newThumbIds = nextIds.filter((id) => !prevIds.has(id));

        if (newThumbIds.length > 0) {
          debugFileListLayout(
            "before thumbnail state update",
            collectLayoutDebugData({
              firstThumbId: newThumbIds[0],
              newThumbCount: newThumbIds.length,
              newThumbIds: newThumbIds.slice(0, 8).map((id) => id.slice(0, 8)),
              previousFetchedThumbs: Object.keys(prev).length,
              nextFetchedThumbs: nextIds.length,
            }),
          );
        }

        return next;
      });
    },
    [collectLayoutDebugData],
  );

  /**
   * 当前视图所有文件均参与缩略图拉取/生成，包括嵌套子文件夹中的文件。
   * thumbCoverage 机制（visibleIds ∪ 前 N 条）已通过 IntersectionObserver 控制优先级。
   */
  const thumbLoadScopeFiles = useMemo(() => filteredFiles, [filteredFiles]);

  /**
   * 首屏必须与 IntersectionObserver 可见集合并：可见 id ∪ 当前作用域排序前 N 条（见 thumbCoverage）。
   */
  const thumbFetchAllowIds = useMemo(
    () => computeThumbFetchAllowIds(visibleThumbIds, thumbLoadScopeFiles),
    [visibleThumbIds, thumbLoadScopeFiles],
  );

  const { thumbFetchingRef } = useThumbnailPipeline({
    thumbLoadScopeFiles,
    thumbFetchAllowIds,
    draftStateById,
    fetchedThumbSvgByIdRef: fetchedThumbsRef,
    fetchedThumbHashByIdRef,
    fileThumbHashByIdRef,
    setFetchedThumbs: setFetchedThumbsWithLayoutDebug,
  });

  const openNewFileDialog = useCallback(() => {
    setNewFileDialogOpen(true);
  }, []);

  const newDocumentFolderId = useMemo((): string | null | undefined => {
    if (sidebarView !== "all") {
      return undefined;
    }
    return currentFolderId;
  }, [sidebarView, currentFolderId]);

  const importTargetFolderId = useMemo(() => {
    return sidebarView === "all" ? currentFolderId : null;
  }, [sidebarView, currentFolderId]);

  const openNewDocument = useCallback(
    (kind: string) => {
      const folderOpts =
        newDocumentFolderId !== undefined
          ? { folderId: newDocumentFolderId }
          : undefined;
      void bootstrapLocalDraftSession(kind, folderOpts).then(({ id }) => {
        window.location.hash = editorRegistry.buildFileHash(id, kind);
      });
    },
    [newDocumentFolderId],
  );

  const commitNewDocumentPick = useCallback(
    (kind: string) => {
      setNewFileDialogOpen(false);
      if (sidebarView === "all") {
        setFormalCreateKind(kind);
        return;
      }
      openNewDocument(kind);
    },
    [openNewDocument, sidebarView],
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
      formalCreateInFlightRef.current = true;
      setFormalCreateSaving(true);
      try {
        const plugin = editorRegistry.getByKind(kind);
        if (!plugin?.createFile) {
          throw new Error(`无法创建 ${kind} 文档`);
        }
        const { id } = await plugin.createFile({ name, folderId });
        recordRecentFileAccess(id);
        setFormalCreateKind(null);
        window.location.hash = editorRegistry.buildFileHash(id, kind);
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        await refresh({ silent: true, noErrorOnFailure: true });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? "创建失败");
        setError(message);
      } finally {
        formalCreateInFlightRef.current = false;
        setFormalCreateSaving(false);
      }
    },
    [formalCreateKind, refresh],
  );

  const openMoveDialog = useCallback((e: React.MouseEvent, f: ServerFile) => {
    e.stopPropagation();
    if (isLocalDraftFileId(f.id)) {
      return;
    }
    setMoveDialogFile(f);
    setMoveTargetFolderId(f.folder_id ?? null);
  }, []);

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

  const importOneFileWithKind = useCallback(
    async (file: File, kind: string) => {
      if (file.size > EDITOR_MAX_IMAGE_FILE_BYTES) {
        throw new Error(
          `「${file.name}」超过 ${formatEditorMaxImageFileSizeMb()} 上限，无法导入。`,
        );
      }
      const plugin = editorRegistry.getByKind(kind);
      if (!plugin?.importFile) {
        throw new Error(
          `无法使用所选编辑器导入「${file.name}」。`,
        );
      }
      logList.debug("import start", {
        name: file.name,
        type: file.type,
        size: file.size,
        kind,
        folderId: importTargetFolderId,
      });
      const { id } = await plugin.importFile({
        file,
        fileName: sanitizeFileBaseName(file.name),
        folderId: importTargetFolderId,
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
    try {
      await refresh({ silent: true, noErrorOnFailure: true });
      setImportNotice(null);
    } catch {
      setImportNotice(
        `已导入 ${createdIds.length} 个文件，但列表未能自动更新。请刷新本页以查看最新文件。`,
      );
    }
  }, [refresh]);

  const processImportQueue = useCallback(async function processImportQueue() {
    const queue = importQueueRef.current;
    if (queue.length === 0) {
      await finishImportBatch();
      return;
    }
    const file = queue[0]!;
    try {
      const kinds = await detectImportCandidateKinds(file);
      if (kinds.length === 0) {
        throw new Error(
          `无法识别「${file.name}」的文档格式，请确认它是 ${editorRegistry.importableEditorNames()} 文件。`,
        );
      }
      if (kinds.length === 1) {
        await importOneFileWithKind(file, kinds[0]!);
        importQueueRef.current = queue.slice(1);
        await processImportQueue();
        return;
      }
      const plugins = kinds
        .map((k) => editorRegistry.getByKind(k))
        .filter((p): p is EditorPlugin => !!p?.importFile);
      pendingImportFileRef.current = file;
      setImportPickerFileName(file.name);
      setImportKindPlugins(plugins);
      setImportKindDialogOpen(true);
      setImporting(false);
    } catch (e: unknown) {
      logList.debug("import error", e);
      const createdIds = [...importCreatedIdsRef.current];
      const failedDeletes = await rollbackCreatedImportFiles(createdIds);
      importCreatedIdsRef.current = [];
      importQueueRef.current = [];
      let msg = formatImportErrorMessage(e);
      if (failedDeletes.length > 0) {
        msg += ` 另：有 ${failedDeletes.length} 个已创建项未能从服务器自动删除，请刷新列表后检查并手动删除重复或空白文件。`;
      }
      setImportNotice(null);
      setError(msg);
      setImporting(false);
    }
  }, [finishImportBatch, importOneFileWithKind]);

  const importDocumentFiles = useCallback(
    async (fileList: File[]) => {
      if (fileList.length === 0) {
        return;
      }
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
      setImporting(false);
    })();
  }, []);

  const importKindOverlayDismiss = useStrictOverlayDismiss(
    dismissImportKindDialog,
  );

  const onSceneImportInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.files;
    const picked = raw ? Array.from(raw) : [];
    e.target.value = "";
    if (picked.length === 0) {
      return;
    }
    void importDocumentFiles(picked);
  };

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
    },
    [importing, draggingFolderId],
  );

  const onFileListImportDrop = useCallback(
    (e: React.DragEvent) => {
      if (importing) {
        return;
      }
      if (draggingFolderId || e.dataTransfer.types?.includes(FOLDER_DND_MIME)) {
        return;
      }
      e.preventDefault();
      const { files } = e.dataTransfer;
      if (!files?.length) {
        return;
      }
      const next = takeImportableFilesFromList(files);
      if (next.length === 0) {
        setError(
          "未识别到可导入的文档文件（如 .excalidraw、.smm、.json、.png、.svg）。",
        );
        return;
      }
      void importDocumentFiles(next);
    },
    [importing, draggingFolderId, importDocumentFiles],
  );

  const handleDelete = async (
    e: React.MouseEvent,
    id: string,
    name: string,
  ) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除「${name}」？`)) {
      return;
    }
    try {
      if (isLocalDraftFileId(id)) {
        await discardLocalDraftSession(id);
        await refresh({ silent: true });
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
      logPipe.debug("delete: cleared thumb state + fetching ref", {
        id8: id.slice(0, 8),
      });
      await refresh({ silent: true });
    } catch (err: any) {
      setError(err.message);
    }
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
        if (isLocalDraftFileId(id)) {
          const existing = LocalDraftSessions.get(id);
          if (existing) {
            LocalDraftSessions.upsert({
              ...existing,
              name: trimmed,
              updated_at: new Date().toISOString(),
            });
          }
          setRecentRevision((n) => n + 1);
        } else {
          await ServerSync.renameFile(id, trimmed);
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
          );
        }
      } catch (err: any) {
        setError(err.message);
      }
    }
    setRenamingId(null);
  };

  const selectFolder = (folderId: string | null) => {
    setSidebarView("all");
    if (isFileListLayoutDebugEnabled()) {
      const data = {
        fromFolderId: currentFolderId ?? "__ROOT__",
        fromFolderName: currentFolderId
          ? foldersById.get(currentFolderId)?.name ?? null
          : "所有文件",
        toFolderId: folderId ?? "__ROOT__",
        toFolderName: folderId ? foldersById.get(folderId)?.name ?? null : "所有文件",
        visibleThumbs: visibleThumbIds.size,
      };
      pendingLayoutDebugRef.current = {
        label: "after selectFolder layout",
        data,
      };
      debugFileListLayout(
        "before selectFolder setState",
        collectLayoutDebugData(data),
      );
    }
    setCurrentFolderId(folderId);
    setMobileTreeOpen(false);
  };

  const startCreateFolder = (parentId: string | null) => {
    setFolderDraft({ mode: "create", parentId });
    setFolderNameValue("新建文件夹");
  };

  const startRenameFolder = (folder: ServerFolder) => {
    setFolderDraft({ mode: "rename", folder });
    setFolderNameValue(folder.name);
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
          ...getOrderedFolderChildIds(parentId).filter((id) => id !== created.id),
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
        const updated = await ServerSync.renameFolder(folderDraft.folder.id, name);
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

  const deleteFolder = async (folder: ServerFolder) => {
    if (
      !window.confirm(
        `删除文件夹 "${folder.name}"? 文件会移动到根目录，子文件夹会被删除。`,
      )
    ) {
      return;
    }
    try {
      await ServerSync.deleteFolder(folder.id);
      invalidateInflightRefresh();
      setFolders((prev) => {
        const next = prev.filter((item) => item.id !== folder.id);
        writeFileListTreeCache({ folders: next, files: filesRef.current });
        return next;
      });
      if (currentFolderId === folder.id) {
        setCurrentFolderId(ROOT_ID);
      }
      void refresh({ silent: true, noErrorOnFailure: true }).catch(() => {
        // Background reconcile; optimistic state already applied.
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Sidebar folder drag: reorder siblings & reparent (nested) via POST /files/order ──

  const getOrderedFolderChildIds = useCallback(
    (parentId: string | null) =>
      folders
        .filter((f) => folderParentId(f) === parentId)
        .sort(compareManual)
        .map((f) => f.id),
    [folders],
  );

  const quickCreateFolder = useCallback(async () => {
    if (folderCreateInFlightRef.current) {
      return;
    }
    folderCreateInFlightRef.current = true;
    const parentId =
      currentFolderId === ROOT_ID ? null : currentFolderId;
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
          const ids = getOrderedFolderChildIds(ROOT_ID).filter((id) => id !== sourceId);
          ids.push(sourceId);
          await ServerSync.saveOrder(ROOT_ID, toItems(ids));
        } else if (mode === "into") {
          const parentId = targetId;
          const ids = getOrderedFolderChildIds(parentId).filter((id) => id !== sourceId);
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
        debugFolderDnd("apply drop done", { sourceId8: sourceId.slice(0, 8), targetId, mode });
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
    [
      foldersById,
      getOrderedFolderChildIds,
      isValidFolderDrop,
      refresh,
    ],
  );

  const isFolderListDrag = (e: React.DragEvent) =>
    !!draggingFolderId || e.dataTransfer.types.includes(FOLDER_DND_MIME);

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
      hint: "localStorage excalidraw-filelist-folder-dnd-debug=1",
    });
  };

  const onFolderRowDragOver = (e: React.DragEvent, folder: ServerFolder) => {
    if (!isFolderListDrag(e)) {
      return;
    }
    e.preventDefault();
    updateFolderRowIndicator(e, folder.id);
  };

  const onFolderRowDrop = (e: React.DragEvent, folder: ServerFolder) => {
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
    debugFolderDnd("root drop", { sourceId8: sourceId.slice(0, 8), mode: "into" });
    void applyFolderDrop(sourceId, "__ROOT__", "into");
  };

  // ── Render helpers ──

  const renderFolderTree = (parentId: string | null, depth = 0) => {
    const children = folders
      .filter((folder) => folderParentId(folder) === parentId)
      .sort(compareManual);
    return children.map((folder) => {
      const hasChildren = folders.some((f) => folderParentId(f) === folder.id);
      const expanded = expandedFolders[folder.id] ?? true;
      const active = currentFolderId === folder.id;
      const isDragging = draggingFolderId === folder.id;
      const ind = folderDropIndicator;
      const showBefore =
        ind?.targetId === folder.id && ind.mode === "before";
      const showAfter = ind?.targetId === folder.id && ind.mode === "after";
      const showInto = ind?.targetId === folder.id && ind.mode === "into";
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
                depth > 0
                  ? { paddingLeft: `${depth * 0.75}rem` }
                  : undefined
              }
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
                onClick={() =>
                  setExpandedFolders((prev) => ({
                    ...prev,
                    [folder.id]: !expanded,
                  }))
                }
                aria-label={expanded ? "折叠文件夹" : "展开文件夹"}
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
              <button
                type="button"
                className="filelist__tree-action"
                title="重命名文件夹"
                onClick={() => startRenameFolder(folder)}
              >
                <Icon type="edit" size={14} />
              </button>
              <button
                type="button"
                className="filelist__tree-action filelist__tree-action--danger"
                title="删除文件夹"
                onClick={() => void deleteFolder(folder)}
              >
                <Icon type="delete" size={14} />
              </button>
            </div>
          </div>
          {expanded && renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  };

  const selectAllFilesView = useCallback(() => {
    setSidebarView("all");
    selectFolder(ROOT_ID);
    setAllFilesTreeExpanded(true);
  }, [selectFolder, setSidebarView]);

  const toggleAllFilesTree = useCallback(() => {
    setAllFilesTreeExpanded((open) => !open);
  }, []);

  const renderSidebarNav = () => (
      <nav className="filelist__sidebar-menu" aria-label="文件列表分区">
        <button
          type="button"
          className={[
            "filelist__sidebar-menu-item",
            sidebarView === "recent" ? "filelist__sidebar-menu-item--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setSidebarView("recent")}
        >
          <span className="filelist__sidebar-menu-icon" aria-hidden>
            <Icon type="clock" size={18} />
          </span>
          <span className="filelist__sidebar-menu-label">最近</span>
        </button>

        <div className="filelist__sidebar-divider" role="separator" />

        <div className="filelist__sidebar-section">
          <div
            className={[
              "filelist__sidebar-menu-row",
              sidebarView === "all" && currentFolderId === ROOT_ID
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
                sidebarView === "all" && currentFolderId === ROOT_ID
                  ? "filelist__sidebar-menu-item--active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={selectAllFilesView}
            >
              <span className="filelist__sidebar-menu-icon" aria-hidden>
                <Icon type="home" size={18} />
              </span>
              <span className="filelist__sidebar-menu-label">所有文件</span>
            </button>
            <button
              type="button"
              className="filelist__sidebar-menu-chevron"
              aria-expanded={
                sidebarView === "all" && allFilesTreeExpanded
              }
              aria-label={
                sidebarView === "all" && allFilesTreeExpanded
                  ? "收起文件夹"
                  : "展开文件夹"
              }
              onClick={(event) => {
                event.stopPropagation();
                if (sidebarView !== "all") {
                  setSidebarView("all");
                  selectFolder(currentFolderId ?? ROOT_ID);
                  setAllFilesTreeExpanded(true);
                  return;
                }
                toggleAllFilesTree();
              }}
            >
              <span
                className={[
                  "filelist__sidebar-menu-chevron-icon",
                  sidebarView === "all" && allFilesTreeExpanded
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

          {sidebarView === "all" && allFilesTreeExpanded ? (
            <div className="filelist__sidebar-subtree">
              <button
                type="button"
                className="filelist__sidebar-subtree-action"
                onClick={() => void quickCreateFolder()}
              >
                <Icon type="plus" size={14} />
                <span>新建文件夹</span>
              </button>
              <div className="filelist__tree filelist__tree--nested">
                {renderFolderTree(ROOT_ID)}
              </div>
            </div>
          ) : null}
        </div>
      </nav>
  );

  const renderTopbarImport = () => (
    <label
      className={[
        "filelist__topbar-import",
        "filelist__import-scene-btn",
        "filelist__import-scene-btn--file",
        importing ? "filelist__import-scene-btn--busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-disabled={importing || undefined}
      aria-busy={importing || undefined}
      title={`导入 ${editorRegistry.importableEditorNames()} 文档`}
    >
      <span className="filelist__import-scene-facade">
        <Icon type="upload" size={18} />
        {importing ? "导入中…" : "导入"}
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

  const renderSidebarTools = () => (
    <div className="filelist__sidebar-tools">
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

  const renderSidebar = () => (
    <aside
      className="filelist__sidebar filelist__sidebar--nav"
      ref={sidebarRef}
    >
      <div className="filelist__sidebar-brand">
        <ImageIcon src={MAIN_SITE_ICON} alt="" size={22} />
        <span className="filelist__sidebar-brand-title">{HOME_APP_TITLE}</span>
      </div>
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
    const localDraftThumb =
      state?.localDraftThumb ??
      (preferLocalThumb ? LocalThumbnailCache.get(f.id) : null);
    const localThumb = preferLocalThumb ? localDraftThumb : null;
    const shouldUseDraftPreview = preferLocalThumb;
    const thumbnailChoice = chooseFileCardThumbnail({
      syncState,
      preferLocalThumb,
      localThumb,
      fetchedThumb: fetchedThumbs[f.id] ?? null,
    });
    const thumbSvg = thumbnailChoice.thumbSvg;
    const kind = editorRegistry.resolveKind(f.kind);
    const thumbDisplay = resolveFileCardThumbDisplay(
      f.id,
      f,
      fetchedThumbs[f.id] ?? null,
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
    if (kind === "mindmap" && cardThumbSvg && isFileListThumbnailDebugEnabled()) {
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
          badge={thumbDisplay.badge}
          thumbBg={thumbDisplay.thumbBg}
          ref={(node: HTMLDivElement | null) => thumbRefCallback(node, f.id)}
          data-thumb-file-id={f.id}
        >
          <div className="filelist__card-actions">
            <button
              className="filelist__card-action"
              title="重命名"
              onPointerDown={() => suppressNextCardOpen(f.id)}
              onClick={(e) => startRename(e, f.id, f.name)}
            >
              <Icon type="edit" size={16} />
            </button>
            {!isBrowserDraft ? (
              <button
                className="filelist__card-action"
                title="移动到文件夹"
                onClick={(e) => openMoveDialog(e, f)}
              >
                <Icon type="move" size={16} />
              </button>
            ) : null}
            {!isBrowserDraft ? (
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
            <button
              className="filelist__card-action"
              title="下载"
              onClick={(e) => handleDownload(e, f.id, f.name)}
            >
              <Icon type="download" size={16} />
            </button>
            <button
              className="filelist__card-action filelist__card-action--danger"
              title="删除"
              onClick={(e) => handleDelete(e, f.id, f.name)}
            >
              <Icon type="delete" size={16} />
            </button>
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
                  logFileListOpen("card name click → startRename (same as rename button)", {
                    fileId8: f.id.slice(0, 8),
                  });
                  startRename(e, f.id, f.name);
                }}
              >
                {highlightMatch(f.name, q)}
              </span>
            )}
          </div>
          <div className="filelist__card-meta">
            <span>{new Date(effectiveUpdatedAt(f)).toLocaleString()}</span>
            {(f.archive_count ?? 0) > 0 && (
              <span className="filelist__card-badge">{f.archive_count} 存档</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const showNewEntryCard = !searchQuery.trim();
  const empty =
    !loading && filteredFiles.length === 0 && !showNewEntryCard;

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
      return (
        <div key={folder.id} className="filelist__move-tree-node">
          <button
            type="button"
            className={[
              "filelist__move-option",
              isSelected ? "filelist__move-option--active" : "",
              isCurrent ? "filelist__move-option--current" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ paddingLeft: `${0.75 + depth * 0.9}rem` }}
            disabled={isCurrent}
            onClick={() => setMoveTargetFolderId(folder.id)}
          >
            <Icon type="folder" size={16} />
            <span className="filelist__move-option-label">
              {folder.name}
              {isCurrent ? "（当前位置）" : ""}
            </span>
          </button>
          {renderMoveTargetFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  };

  const moveFileInAllFiles = moveDialogFile
    ? (moveDialogFile.folder_id ?? null) === null
    : false;
  const moveTargetIsAllFiles = moveDialogFile
    ? moveTargetFolderId === null
    : false;

  return (
    <div className="filelist">
      {importing && (
        <div className="filelist__import-blocking" aria-busy>
          <span>正在导入…</span>
        </div>
      )}

      {renderSidebar()}

      <div
        className="filelist__workspace"
        onDragOver={onFileListImportDragOver}
        onDrop={onFileListImportDrop}
      >
        {importNotice && (
          <div className="filelist__notice" role="status">
            {importNotice}
          </div>
        )}
        {error && <div className="filelist__error">{error}</div>}

        <header className="filelist__topbar">
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
                  <button type="button" onClick={() => selectAllFilesView()}>
                    所有文件
                  </button>
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
          {loading ? (
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
            <div
              className="filelist__grid"
              ref={gridRef}
              key={`${sidebarView}:${currentFolderId ?? "root"}:${sortKey}:${searchQuery.trim()}`}
            >
              {showNewEntryCard ? renderNewEntryCard(0) : null}
              {filteredFiles.map((f, i) =>
                renderFileCard(f, showNewEntryCard ? i + 1 : i),
              )}
            </div>
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
              <div className="filelist__sidebar-brand">
                <ImageIcon src={MAIN_SITE_ICON} alt="" size={22} />
                <span className="filelist__sidebar-brand-title">
                  {HOME_APP_TITLE}
                </span>
              </div>
              <div className="filelist__sidebar-scroll">
                {renderSidebarNav()}
                {renderSidebarTools()}
              </div>
            </div>
          </div>
        </div>
      )}

      {folderDraft && (
        <div
          className="filelist__detail-overlay"
          role="dialog"
          aria-modal
          {...folderDraftOverlayDismiss}
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
        </div>
      )}

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />

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
        presetFolderId={newDocumentFolderId}
        title="新建文件"
        hint="为文件命名后将在当前文件夹中创建。"
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
        <div
          className="filelist__detail-overlay"
          role="dialog"
          aria-modal
          {...moveDialogOverlayDismiss}
        >
          <div
            className="filelist__detail-card filelist__move-dialog"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 className="filelist__detail-title">
              移动「{moveDialogFile.name}」
            </h2>
            <p className="filelist__new-file-hint">选择要移动到的文件夹</p>
            <div className="filelist__move-list" role="list" aria-label="文件夹列表">
              <div className="filelist__move-tree-node" role="listitem">
                <button
                  type="button"
                  className={[
                    "filelist__move-option",
                    "filelist__move-option--root",
                    moveTargetIsAllFiles ? "filelist__move-option--active" : "",
                    moveFileInAllFiles ? "filelist__move-option--current" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={moveFileInAllFiles}
                  onClick={() => setMoveTargetFolderId(null)}
                >
                  <Icon type="grid" size={16} />
                  <span className="filelist__move-option-label">
                    所有文件
                    {moveFileInAllFiles ? "（当前位置）" : ""}
                  </span>
                </button>
              </div>
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
        </div>
      )}

      <EmbedTokenManager
        fileId={embedFile?.id ?? ""}
        fileName={embedFile?.name ?? ""}
        open={!!embedFile}
        onClose={() => setEmbedFile(null)}
      />
    </div>
  );
};
