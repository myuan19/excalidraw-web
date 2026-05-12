import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createLogger, logFileListOpen } from "../lib/logger";
import {
  readFileListTreeCache,
  writeFileListTreeCache,
} from "../data/fileListSessionCache";
import { FileSyncState } from "../data/FileSyncState";
import { chooseFileCardThumbnail } from "../data/fileCardThumbnail";
import {
  formatImportErrorMessage,
  loadExcalidrawFileAsServerSceneData,
} from "../data/importExcalidrawScene";
import { LocalThumbnailCache } from "../data/localThumbnailCache";
import { detectFormat } from "../data/formats/detectFormat";
import {
  ServerSync,
  type FileOrderItem,
  type ServerFile,
  type ServerFolder,
} from "../data/ServerSync";
import {
  getDocumentFormatAdapter,
  MindMapAdapter,
} from "../data/formats/registry";
import {
  buildSceneThumbnailSvg,
  extractThumbBg,
  patchThumbnailSvgForCard,
} from "../data/thumbnailSvg";
import {
  ensureAIConfigLoaded,
  isAIConfigured,
  subscribeAIConfig,
} from "../data/aiConfig";
import { computeThumbFetchAllowIds } from "../data/thumbCoverage";
import { createBlankExcalidrawInitialScene } from "../data/forkFileScene";
import { AISettings } from "./AISettings";
import { EmbedTokenManager } from "./EmbedTokenManager";

import { useThumbnailPipeline } from "../hooks/useThumbnailPipeline";

import "./FileList.scss";

const logList = createLogger({ module: "fileList" });
const logThumb = createLogger({ module: "thumbnail" });
const logPipe = createLogger({ module: "thumbPipeline" });

const HOME_APP_TITLE = "绘图空间";
const DRAWING_SPACE_ICON = "/icons/drawing-space.svg";
const EXCALIDRAW_EDITOR_ICON = "/icons/excalidraw.svg";
const MINDMAP_EDITOR_ICON = "/icons/mindmap.ico";

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
  try {
    return localStorage.getItem("excalidraw-filelist-thumbnail-debug") === "1";
  } catch {
    return false;
  }
}

function isFileListLayoutDebugEnabled(): boolean {
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
  console.log(
    `[DEBUG] FileList.renderFileCard | ${label}`,
    JSON.stringify(data, null, 2),
  );
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
  const payload = {
    t:
      typeof performance === "undefined"
        ? null
        : Math.round(performance.now()),
    ...data,
  };
  console.log(
    `[DEBUG] FileList.layout | ${label}`,
    JSON.stringify(payload, null, 2),
  );
}

interface FileListProps {
  onOpenFile: (file: { id: string; kind?: string }) => void;
  onReady?: () => void;
}

type SortKey = "updated_at" | "created_at" | "name";
type NewDocumentKind = "excalidraw" | "mindmap";
type FolderDraft =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: ServerFolder };

const ROOT_ID: string | null = null;

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
    | "embed",
) {
  const paths = {
    folder:
      "M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z",
    file:
      "M6 2h8l4 4v16H6V2zm7 1.5V7h3.5",
    grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
    home:
      "M12 3l9 8h-2v9h-5v-6h-4v6H5v-9H3l9-8z",
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

function editorIconSrc(kind: string): string {
  return kind === "mindmap" ? MINDMAP_EDITOR_ICON : EXCALIDRAW_EDITOR_ICON;
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

export const FileList: React.FC<FileListProps> = ({ onOpenFile, onReady }) => {
  useEffect(() => {
    document.title = HOME_APP_TITLE;
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
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
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
  const [draftThumbs, setDraftThumbs] = useState<Record<string, string>>({});
  const [visibleThumbIds, setVisibleThumbIds] = useState<Set<string>>(
    () => new Set(),
  );
  const sceneImportInputRef = useRef<HTMLInputElement>(null);
  const thumbObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbNodeMap = useRef<Map<string, HTMLElement>>(new Map());
  const sidebarRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pendingLayoutDebugRef = useRef<{
    label: string;
    data: Record<string, unknown>;
  } | null>(null);
  const previousFetchedThumbIdsRef = useRef<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiDotOk, setAiDotOk] = useState(false);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("未命名");
  const [newDocumentKind, setNewDocumentKind] =
    useState<NewDocumentKind>("excalidraw");

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
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("excalidraw-file-sync-state", bump);
      window.removeEventListener("excalidraw-server-saved", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const inflightRef = useRef<AbortController | null>(null);
  const currentFolderIdRef = useRef(currentFolderId);
  currentFolderIdRef.current = currentFolderId;

  const foldersById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const refresh = useCallback(
    async (options?: { silent?: boolean; noErrorOnFailure?: boolean }) => {
      if (inflightRef.current) {
        inflightRef.current.abort();
      }
      const ac = new AbortController();
      inflightRef.current = ac;
      try {
        if (!options?.silent) {
          setLoading(true);
        }
        logList.debug("refresh start");
        const tree = await ServerSync.listFileTree({ signal: ac.signal });
        if (ac.signal.aborted) {
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
        if (ac.signal.aborted) {
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
    const byId: Record<
      string,
      {
        syncState: "synced" | "draft";
        baseHash: string | null;
        draftHash: string | null;
        localDraftThumb: string | null;
        localRecord: ReturnType<typeof FileSyncState.getLocalCache>;
        localElementCount: number;
        hasDraftLocalState: boolean;
      }
    > = {};
    for (const f of files) {
      const syncState = FileSyncState.getSyncState(f.id);
      const localDraftThumb =
        syncState === "draft" ? LocalThumbnailCache.get(f.id) : null;
      const localRecord =
        syncState === "draft" ? FileSyncState.getLocalCache(f.id) : null;
      const localElementCount = Array.isArray(localRecord?.elements)
        ? localRecord.elements.length
        : 0;
      byId[f.id] = {
        syncState,
        baseHash: FileSyncState.getBaselineHash(f.id),
        draftHash: FileSyncState.getDraftHash(f.id),
        localDraftThumb,
        localRecord,
        localElementCount,
        hasDraftLocalState: syncState === "draft" && !!localRecord,
      };
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

  const filteredFiles = useMemo(() => {
    let list = files;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = files.filter((f) => f.name.toLowerCase().includes(q));
    } else {
      list = files.filter((f) => {
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
  }, [currentFolderId, descendantFolderIds, effectiveUpdatedAt, files, searchQuery, sortKey]);

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
          : "全部文件",
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
    setDraftThumbs,
    setFetchedThumbs: setFetchedThumbsWithLayoutDebug,
  });

  const createFileOnServer = useCallback(
    async (
      name: string,
      initialScene?: { elements: unknown[]; appState: unknown; files: unknown },
    ): Promise<string> => {
      logList.debug("createFileOnServer", {
        name,
        folderId: currentFolderId,
        hasScene: !!initialScene,
        elements: initialScene ? (initialScene.elements as unknown[]).length : 0,
      });
      const created = await ServerSync.createFile(
        name,
        currentFolderId,
        "excalidraw",
      );
      const id = created.id;

      if (initialScene) {
        let thumbnail: string | undefined;
        try {
          thumbnail = await buildSceneThumbnailSvg({
            elements: initialScene.elements,
            appState: initialScene.appState,
            files: initialScene.files,
          });
          LocalThumbnailCache.set(id, thumbnail);
          logThumb.debug(
            `createFileOnServer ${id.slice(0, 8)}, svgLen=${thumbnail.length}`,
          );
        } catch (err) {
          logThumb.debug(
            `createFileOnServer ${id.slice(0, 8)} exportToSvg FAILED`,
            err,
          );
        }

        await ServerSync.saveFileImmediate(id, initialScene, name, thumbnail);

        FileSyncState.setLocalCache(id, {
          elements: initialScene.elements,
          appState: initialScene.appState,
          files: initialScene.files,
          deltas: [],
        });
        logList.debug(
          `createFileOnServer ${id.slice(0, 8)} saved, thumb=${!!thumbnail}`,
        );
      }

      return id;
    },
    [currentFolderId],
  );

  const openNewFileDialog = useCallback(() => {
    setNewFileName("未命名");
    setNewDocumentKind("excalidraw");
    setNewFileDialogOpen(true);
  }, []);

  const commitNewFile = useCallback(async () => {
    const name = newFileName.trim() || "未命名";
    setNewFileDialogOpen(false);
    try {
      if (newDocumentKind === "mindmap") {
        const created = await ServerSync.createFile(
          name,
          currentFolderId,
          "mindmap",
        );
        const mindMapData = MindMapAdapter.createEmpty();
        const document = MindMapAdapter.toDocument(mindMapData);
        await ServerSync.saveFileImmediate(created.id, document, name);
        await refresh({ silent: true, noErrorOnFailure: true });
        onOpenFile({ id: created.id, kind: "mindmap" });
        return;
      }

      const id = await createFileOnServer(
        name,
        createBlankExcalidrawInitialScene(name),
      );
      onOpenFile({ id, kind: "excalidraw" });
    } catch (e: any) {
      setError(e.message);
    }
  }, [
    newFileName,
    newDocumentKind,
    currentFolderId,
    createFileOnServer,
    onOpenFile,
    refresh,
  ]);

  const openMoveDialog = useCallback((e: React.MouseEvent, f: ServerFile) => {
    e.stopPropagation();
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

  const importDocumentFiles = useCallback(
    async (fileList: File[]) => {
      if (fileList.length === 0) {
        return;
      }
      setImporting(true);
      setError(null);
      setImportNotice(null);
      const createdIds: string[] = [];
      try {
        for (const file of fileList) {
          logList.debug("import start", {
            name: file.name,
            type: file.type,
            size: file.size,
            folderId: currentFolderId,
          });
          const detected = await detectFormat(file);
          if (detected.kind !== "excalidraw") {
            const adapter = getDocumentFormatAdapter(detected.kind);
            if (!adapter || detected.kind === "unknown") {
              throw new Error(
                `无法识别「${file.name}」的文档格式，请确认它是 excalidraw 或 mindmap 文件。`,
              );
            }
            const data = await adapter.parse(file);
            const created = await ServerSync.createFile(
              sanitizeFileBaseName(file.name),
              currentFolderId,
              adapter.kind,
            );
            createdIds.push(created.id);
            await ServerSync.saveFileImmediate(
              created.id,
              adapter.toDocument(data),
              sanitizeFileBaseName(file.name),
            );
            continue;
          }
          const { elements, appState, files: sceneFiles } =
            await loadExcalidrawFileAsServerSceneData(file);
          logList.debug("import parsed", {
            elements: elements.length,
            files: Object.keys(sceneFiles).length,
          });
          const id = await createFileOnServer(sanitizeFileBaseName(file.name), {
            elements,
            appState,
            files: sceneFiles,
          });
          createdIds.push(id);
        }
        try {
          await refresh({ silent: true, noErrorOnFailure: true });
          setImportNotice(null);
        } catch {
          setImportNotice(
            `已导入 ${createdIds.length} 个文件，但列表未能自动更新。请刷新本页以查看最新文件。`,
          );
        }
      } catch (e: unknown) {
        logList.debug("import error", e);
        const failedDeletes = await rollbackCreatedImportFiles(createdIds);
        let msg = formatImportErrorMessage(e);
        if (failedDeletes.length > 0) {
          msg += ` 另：有 ${failedDeletes.length} 个已创建项未能从服务器自动删除，请刷新列表后检查并手动删除重复或空白文件。`;
        }
        setImportNotice(null);
        setError(msg);
      } finally {
        setImporting(false);
      }
    },
    [createFileOnServer, currentFolderId, refresh],
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
      await ServerSync.deleteFile(id);
      FileSyncState.clearLocalCache(id);
      FileSyncState.clearHashStateForFile(id);
      LocalThumbnailCache.clear(id);
      setFetchedThumbs((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setDraftThumbs((prev) => {
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
      await ServerSync.downloadFile(id, name);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(name);
  };

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      try {
        await ServerSync.renameFile(id, trimmed);
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
        );
      } catch (err: any) {
        setError(err.message);
      }
    }
    setRenamingId(null);
  };

  const selectFolder = (folderId: string | null) => {
    if (isFileListLayoutDebugEnabled()) {
      const data = {
        fromFolderId: currentFolderId ?? "__ROOT__",
        fromFolderName: currentFolderId
          ? foldersById.get(currentFolderId)?.name ?? null
          : "全部文件",
        toFolderId: folderId ?? "__ROOT__",
        toFolderName: folderId ? foldersById.get(folderId)?.name ?? null : "全部文件",
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
        const created = await ServerSync.createFolder(name, folderDraft.parentId);
        setFolders((prev) => [...prev, created]);
        setExpandedFolders((prev) => ({
          ...prev,
          ...(folderDraft.parentId ? { [folderDraft.parentId]: true } : {}),
          [created.id]: true,
        }));
        setCurrentFolderId(created.id);
      } else {
        const updated = await ServerSync.renameFolder(folderDraft.folder.id, name);
        setFolders((prev) =>
          prev.map((folder) => (folder.id === updated.id ? updated : folder)),
        );
      }
    } catch (err: any) {
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
      await refresh({ silent: true });
      if (currentFolderId === folder.id) {
        setCurrentFolderId(ROOT_ID);
      }
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
        return;
      }
      const toItems = (ids: string[]): FileOrderItem[] =>
        ids.map((id) => ({ type: "folder" as const, id }));

      try {
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
          await ServerSync.saveOrder(parentId, toItems(ordered));
        }
        await refresh({ silent: true });
      } catch (err: any) {
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
    const preferred: ("before" | "into" | "after")[] =
      ratio < 0.33
        ? ["before", "into", "after"]
        : ratio < 0.66
          ? ["into", "before", "after"]
          : ["after", "into", "before"];
    for (const mode of preferred) {
      if (isValidFolderDrop(src, folderId, mode)) {
        e.dataTransfer.dropEffect = "move";
        setFolderDropInd({ targetId: folderId, mode });
        return;
      }
    }
    e.dataTransfer.dropEffect = "none";
    setFolderDropInd(null);
  };

  const onFolderHandleDragStart = (e: React.DragEvent, folderId: string) => {
    e.dataTransfer.setData(FOLDER_DND_MIME, folderId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingFolderId(folderId);
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
      return;
    }
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
      return;
    }
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
              style={{ paddingLeft: `${0.35 + depth * 0.75}rem` }}
            >
              <span
                className="filelist__tree-drag-handle"
                draggable
                onDragStart={(e) => onFolderHandleDragStart(e, folder.id)}
                onDragEnd={clearFolderDragState}
                title="拖动以排序或嵌套"
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

  const renderTreePanel = () => (
    <aside className="filelist__sidebar" ref={sidebarRef}>
      <div className="filelist__sidebar-head">
        <span>文件夹</span>
        <button
          type="button"
          className="filelist__small-btn"
          onClick={() => startCreateFolder(currentFolderId)}
        >
          <Icon type="plus" size={15} />
          新建
        </button>
      </div>
      <button
        type="button"
        className={[
          "filelist__tree-root",
          currentFolderId === ROOT_ID ? "filelist__tree-root--active" : "",
          folderDropIndicator?.targetId === "__ROOT__" &&
          folderDropIndicator.mode === "into"
            ? "filelist__tree-root--drop-into"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => selectFolder(ROOT_ID)}
        onDragOver={onRootRowDragOver}
        onDrop={onRootRowDrop}
      >
        <Icon type="grid" size={16} />
        全部文件
      </button>
      <div className="filelist__tree">{renderFolderTree(ROOT_ID)}</div>
    </aside>
  );

  const renderFileCard = (f: ServerFile, index: number) => {
    const state = draftStateById[f.id];
    const syncState = state?.syncState ?? "synced";
    const localDraftThumb = state?.localDraftThumb ?? null;
    const localThumb =
      syncState === "draft" ? draftThumbs[f.id] || localDraftThumb : null;
    const shouldUseDraftPreview = syncState === "draft";
    const thumbnailChoice = chooseFileCardThumbnail({
      syncState,
      localThumb,
      fetchedThumb: fetchedThumbs[f.id] ?? null,
    });
    const thumbSvg = thumbnailChoice.thumbSvg;
    const kind = f.kind ?? "excalidraw";
    const cardThumbSvg = thumbSvg ? patchThumbnailSvgForCard(thumbSvg) : null;
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
    const thumbLoading = !thumbSvg && f.has_thumbnail;
    return (
      <div
        key={f.id}
        className="filelist__card"
        style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
        onClick={(ev) => {
          const t = ev.target as HTMLElement;
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
            kind: f.kind ?? "excalidraw",
            targetTag: t?.tagName,
            targetClass: String(t?.className || "").slice(0, 100),
          });
          onOpenFile({ id: f.id, kind: f.kind ?? "excalidraw" });
        }}
      >
        <div
          className="filelist__card-thumb"
          data-thumb-file-id={f.id}
          ref={(node) => thumbRefCallback(node, f.id)}
          style={thumbSvg ? { background: extractThumbBg(thumbSvg) } : undefined}
        >
          {syncState === "draft" && (
            <span
              className="filelist__card-thumb-badge"
              title="有未保存到服务器的更改"
            >
              未保存
            </span>
          )}
          {thumbSvg ? (
            <div
              className="filelist__card-thumb-svg"
              dangerouslySetInnerHTML={{
                __html: cardThumbSvg ?? "",
              }}
            />
          ) : thumbLoading ? (
            <div className="filelist__card-thumb-loading" />
          ) : (
            <div className="filelist__card-thumb-placeholder">
              <ImageIcon src={editorIconSrc(kind)} alt="" size={40} />
            </div>
          )}
          <div className="filelist__card-actions">
            <button
              className="filelist__card-action"
              title="重命名"
              onClick={(e) => startRename(e, f.id, f.name)}
            >
              <Icon type="edit" size={16} />
            </button>
            <button
              className="filelist__card-action"
              title="移动到文件夹"
              onClick={(e) => openMoveDialog(e, f)}
            >
              <Icon type="move" size={16} />
            </button>
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
        </div>
        <div className="filelist__card-body">
          <div className="filelist__card-name-row">
            {renamingId === f.id ? (
              <input
                className="filelist__card-rename"
                value={renameValue}
                autoFocus
                onClick={(e) => e.stopPropagation()}
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

  const empty = !loading && filteredFiles.length === 0;

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
      <header
        className="filelist__header"
        onDragOver={onFileListImportDragOver}
        onDrop={onFileListImportDrop}
      >
        <div className="filelist__header-left">
          <button
            type="button"
            className="filelist__mobile-menu"
            onClick={() => setMobileTreeOpen(true)}
            aria-label="打开文件夹"
          >
            <Icon type="menu" size={20} />
          </button>
          <ImageIcon src={DRAWING_SPACE_ICON} alt="" size={22} />
          <h1 className="filelist__title">{HOME_APP_TITLE}</h1>
        </div>
        <div className="filelist__header-right">
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
          <div className="filelist__header-group">
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
          </div>
          <div className="filelist__header-group">
            <button
              type="button"
              className="filelist__ai-btn"
              onClick={() => setShowAISettings(true)}
              title="AI：Base URL 与 API Key"
            >
              <span
                className={`filelist__ai-dot ${
                  aiDotOk ? "filelist__ai-dot--ok" : ""
                }`}
              />
              AI 设置
            </button>
            <label
              className={[
                "filelist__import-scene-btn",
                "filelist__import-scene-btn--file",
                importing ? "filelist__import-scene-btn--busy" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-disabled={importing || undefined}
              aria-busy={importing || undefined}
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
                accept=".excalidraw,.smm,.txt,.json,.png,.svg,application/vnd.excalidraw+json,application/vnd.simple-mind-map+json,application/json,text/plain,image/png,image/svg+xml"
                className="filelist__file-input-overlay"
                onChange={onSceneImportInputChange}
                disabled={importing}
                tabIndex={-1}
                title="导入 excalidraw 或 mindmap 文档"
              />
            </label>
            <button className="filelist__new-btn" onClick={openNewFileDialog}>
              <Icon type="plus" size={18} />
              新建
            </button>
          </div>
        </div>
      </header>

      {importNotice && (
        <div className="filelist__notice" role="status">
          {importNotice}
        </div>
      )}
      {error && <div className="filelist__error">{error}</div>}

      <div
        className="filelist__shell"
        onDragOver={onFileListImportDragOver}
        onDrop={onFileListImportDrop}
      >
        {renderTreePanel()}
        <main className="filelist__main" ref={mainRef}>
          <div className="filelist__pathbar">
            <div className="filelist__breadcrumbs">
              <button
                type="button"
                onClick={() => selectFolder(ROOT_ID)}
              >
                全部文件
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
            </div>
          </div>
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
                {searchQuery ? "没有匹配的文件" : "当前文件夹为空"}
              </p>
              {!searchQuery && (
                <div className="filelist__empty-actions">
                  {importing ? (
                    <span
                      className="filelist__import-scene-btn filelist__import-scene-btn--busy"
                      aria-busy
                      aria-disabled
                    >
                      <Icon type="upload" size={18} />
                      导入中…
                    </span>
                  ) : (
                    <label
                      className="filelist__import-scene-btn"
                      htmlFor={FILELIST_SCENE_IMPORT_INPUT_ID}
                    >
                      <Icon type="upload" size={18} />
                      导入文件
                    </label>
                  )}
                  <button
                    type="button"
                    className="filelist__new-btn"
                    onClick={openNewFileDialog}
                  >
                    <Icon type="plus" size={18} />
                    创建第一个文件
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              className="filelist__grid"
              ref={gridRef}
              key={`${currentFolderId ?? "root"}:${sortKey}:${searchQuery.trim()}`}
            >
              {filteredFiles.map((f, i) => renderFileCard(f, i))}
            </div>
          )}
        </main>
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
            {renderTreePanel()}
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

      <AISettings open={showAISettings} onClose={() => setShowAISettings(false)} />

      {newFileDialogOpen && (
        <div
          className="filelist__detail-overlay"
          role="dialog"
          aria-modal
          {...newFileOverlayDismiss}
        >
          <div
            className="filelist__detail-card filelist__new-file-dialog"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 className="filelist__detail-title">新建文件</h2>
            <p className="filelist__new-file-hint">
              选择文件类型并起个名字，稍后在列表里也可以随时重命名
            </p>
            <div className="filelist__new-file-kind">
              <button
                type="button"
                className={[
                  "filelist__kind-option",
                  newDocumentKind === "excalidraw"
                    ? "filelist__kind-option--active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setNewDocumentKind("excalidraw")}
              >
                <ImageIcon src={EXCALIDRAW_EDITOR_ICON} alt="" size={18} />
                <span>excalidraw</span>
              </button>
              <button
                type="button"
                className={[
                  "filelist__kind-option",
                  newDocumentKind === "mindmap"
                    ? "filelist__kind-option--active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setNewDocumentKind("mindmap")}
              >
                <ImageIcon src={MINDMAP_EDITOR_ICON} alt="" size={18} />
                <span>mindmap</span>
              </button>
            </div>
            <input
              className="filelist__folder-input filelist__new-file-input"
              value={newFileName}
              autoFocus
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void commitNewFile();
                }
                if (e.key === "Escape") {
                  setNewFileDialogOpen(false);
                }
              }}
            />
            <div className="filelist__detail-actions filelist__new-file-actions">
              <button
                type="button"
                className="filelist__new-btn"
                onClick={() => void commitNewFile()}
              >
                创建并打开
              </button>
              <button
                type="button"
                className="filelist__import-scene-btn"
                onClick={() => setNewFileDialogOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
                    全部文件
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
