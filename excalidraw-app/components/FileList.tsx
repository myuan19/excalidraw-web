import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { debugLog } from "../data/debugLog";
import { FileSyncState } from "../data/FileSyncState";
import {
  formatImportErrorMessage,
  loadExcalidrawFileAsServerSceneData,
} from "../data/importExcalidrawScene";
import { LocalThumbnailCache } from "../data/localThumbnailCache";
import {
  ServerSync,
  type FileOrderItem,
  type ServerFile,
  type ServerFolder,
} from "../data/ServerSync";
import {
  buildSceneThumbnailSvg,
  patchThumbnailSvgForCard,
} from "../data/thumbnailSvg";
import {
  ensureAIConfigLoaded,
  isAIConfigured,
  subscribeAIConfig,
} from "../data/aiConfig";
import { AISettings } from "./AISettings";

import "./FileList.scss";

interface FileListProps {
  onOpenFile: (id: string) => void;
  onReady?: () => void;
}

type SortKey = "manual" | "updated_at" | "created_at" | "name";
type DragItem =
  | { type: "file"; id: string }
  | { type: "folder"; id: string };
type FolderDraft =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: ServerFolder };

const ROOT_ID: string | null = null;
const SIDEBAR_ROOT = "__ROOT__";
const INTERNAL_DRAG_MIME = "application/x-excalidraw-filelist-item";

function dragItemKey(item: DragItem): string {
  return `${item.type}:${item.id}`;
}

function parseDragKey(key: string): DragItem | null {
  const [type, id] = key.split(":") as [string, string];
  if ((type === "file" || type === "folder") && id) {
    return { type, id };
  }
  return null;
}

function computeDropZone(
  clientX: number,
  el: HTMLElement,
  isFolder: boolean,
): "left" | "right" | "center" {
  const rect = el.getBoundingClientRect();
  const ratio = (clientX - rect.left) / rect.width;
  if (isFolder) {
    if (ratio < 0.25) return "left";
    if (ratio > 0.75) return "right";
    return "center";
  }
  return ratio < 0.5 ? "left" : "right";
}

function sanitizeFileBaseName(name: string): string {
  const base =
    name.replace(/\.(excalidraw|json|png|svg)$/i, "").trim() || "Imported";
  return base.slice(0, 120);
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

function iconPath(type: "folder" | "file" | "grid" | "chevron" | "plus" | "upload" | "search" | "ai" | "info" | "open" | "edit" | "download" | "delete" | "menu" | "sort") {
  const paths = {
    folder:
      "M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z",
    file:
      "M6 2h8l4 4v16H6V2zm7 1.5V7h3.5",
    grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
    chevron: "M9 6l6 6-6 6",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    upload: "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z",
    search:
      "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    ai: "M12 2l1.5 5L18 5l-2 4.5 5 1.5-5 1.5L18 17l-4.5-2L12 20l-1.5-5L6 17l2-4.5L3 11l5-1.5L6 5l4.5 2L12 2z",
    info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
    open: "M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    menu: "M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z",
    sort: "M7 4h10v2H7V4zm-3 7h16v2H4v-2zm5 7h6v2H9v-2z",
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

export const FileList: React.FC<FileListProps> = ({ onOpenFile, onReady }) => {
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [folders, setFolders] = useState<ServerFolder[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dropOverlay, setDropOverlay] = useState(false);
  const [fetchedThumbs, setFetchedThumbs] = useState<Record<string, string>>({});
  const fetchedThumbsRef = useRef(fetchedThumbs);
  fetchedThumbsRef.current = fetchedThumbs;
  const [draftThumbs, setDraftThumbs] = useState<Record<string, string>>({});
  const thumbFetchingRef = useRef<Set<string>>(new Set());
  const [visibleThumbIds, setVisibleThumbIds] = useState<Set<string>>(
    () => new Set(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneImportInputRef = useRef<HTMLInputElement>(null);
  const thumbObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbNodeMap = useRef<Map<string, HTMLElement>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [folderNameValue, setFolderNameValue] = useState("");
  const [syncVersion, setSyncVersion] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [showAISettings, setShowAISettings] = useState(false);
  const [detailFile, setDetailFile] = useState<ServerFile | null>(null);
  const [aiDotOk, setAiDotOk] = useState(false);

  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    key: string;
    edge: "left" | "right";
  } | null>(null);
  const [dropIntoFolder, setDropIntoFolder] = useState<string | null>(null);
  const [sidebarDropId, setSidebarDropId] = useState<string | null>(null);

  const [pointerDrag, setPointerDrag] = useState<{
    item: DragItem;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);

  const customSortEnabled = sortKey === "manual";
  const searchActive = !!searchQuery.trim();
  const canReorder = customSortEnabled && !searchActive;

  const clearDragState = useCallback(() => {
    setDragItem(null);
    setDropIndicator(null);
    setDropIntoFolder(null);
    setSidebarDropId(null);
  }, []);

  useEffect(() => {
    const syncAiDot = () => setAiDotOk(isAIConfigured());
    ensureAIConfigLoaded().then(syncAiDot).catch(syncAiDot);
    return subscribeAIConfig(syncAiDot);
  }, []);

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
    return () => {
      if (longPressTimer.current != null) {
        window.clearTimeout(longPressTimer.current);
      }
    };
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

  const foldersById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (inflightRef.current) {
        inflightRef.current.abort();
      }
      const ac = new AbortController();
      inflightRef.current = ac;
      try {
        if (!options?.silent) {
          setLoading(true);
        }
        debugLog.fileList("refresh start");
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
            debugLog.fileList(`clearing stale draft hash for ${f.id.slice(0, 8)}`);
            FileSyncState.clearHashStateForFile(f.id);
          }
        }
        if (currentFolderId && !tree.folders.some((f) => f.id === currentFolderId)) {
          setCurrentFolderId(ROOT_ID);
        }
        debugLog.fileList("refresh done", {
          folders: tree.folders.length,
          count: tree.files.length,
          withThumb: tree.files.filter((x) => x.has_thumbnail || x.thumbnail_svg)
            .length,
          withSha: tree.files.filter((x) => x.content_sha256).length,
        });
        setError(null);
        onReady?.();
      } catch (e: any) {
        if (ac.signal.aborted) {
          return;
        }
        debugLog.fileList("refresh error", e);
        setError(e.message || "Failed to load files");
        onReady?.();
      } finally {
        if (!ac.signal.aborted && !options?.silent) {
          setLoading(false);
        }
        if (inflightRef.current === ac) {
          inflightRef.current = null;
        }
      }
    },
    [currentFolderId, onReady],
  );

  useEffect(() => {
    const onListRefresh = () => {
      debugLog.fileList("excalidraw-file-list-refresh -> refresh()");
      void refresh();
    };
    window.addEventListener("excalidraw-file-list-refresh", onListRefresh);
    return () =>
      window.removeEventListener("excalidraw-file-list-refresh", onListRefresh);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentFolder = currentFolderId
    ? foldersById.get(currentFolderId) ?? null
    : null;
  const currentPath = useMemo(
    () => buildFolderPath(currentFolderId, foldersById),
    [currentFolderId, foldersById],
  );

  const childFolders = useMemo(
    () =>
      folders
        .filter((folder) => folderParentId(folder) === currentFolderId)
        .sort(compareManual),
    [currentFolderId, folders],
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

  const filteredFiles = useMemo(() => {
    let list = files;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = files.filter((f) => f.name.toLowerCase().includes(q));
    } else {
      list = files.filter((f) => (f.folder_id ?? null) === currentFolderId);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === "manual") {
        return compareManual(a, b);
      }
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
  }, [currentFolderId, effectiveUpdatedAt, files, searchQuery, sortKey]);

  useEffect(() => {
    setVisibleThumbIds((prev) => {
      const next = new Set(prev);
      filteredFiles.slice(0, 30).forEach((file) => next.add(file.id));
      return next;
    });
  }, [filteredFiles]);

  useEffect(() => {
    let cancelled = false;
    const toFetch: { id: string; url: string }[] = [];
    for (const f of filteredFiles) {
      if (!visibleThumbIds.has(f.id)) {
        continue;
      }
      const state = draftStateById[f.id];
      const syncState = state?.syncState ?? "synced";
      const localDraftThumb = state?.localDraftThumb ?? null;
      const localRecord = state?.localRecord ?? null;
      if (localDraftThumb) {
        continue;
      }
      if (syncState === "draft") {
        if (!localRecord) {
          continue;
        }
        if (thumbFetchingRef.current.has(f.id)) {
          continue;
        }
        thumbFetchingRef.current.add(f.id);
        void (async () => {
          try {
            const thumbnail = await buildSceneThumbnailSvg({
              elements: localRecord.elements,
              appState: localRecord.appState,
              files: localRecord.files,
            });
            LocalThumbnailCache.set(f.id, thumbnail);
            if (!cancelled) {
              setDraftThumbs((prev) => ({ ...prev, [f.id]: thumbnail }));
            }
          } catch {
            // ignore
          } finally {
            thumbFetchingRef.current.delete(f.id);
          }
        })();
        continue;
      }
      if (!f.has_thumbnail || thumbFetchingRef.current.has(f.id) || fetchedThumbsRef.current[f.id]) {
        continue;
      }
      toFetch.push({
        id: f.id,
        url: `/api/files/${f.id}/thumbnail${
          f.content_sha256 ? `?h=${encodeURIComponent(f.content_sha256)}` : ""
        }`,
      });
    }

    for (const item of toFetch) {
      thumbFetchingRef.current.add(item.id);
      fetch(item.url)
        .then((r) => (r.ok ? r.text() : null))
        .then((svg) => {
          if (cancelled || !svg) {
            return;
          }
          setFetchedThumbs((prev) => ({ ...prev, [item.id]: svg }));
        })
        .catch(() => {})
        .finally(() => {
          thumbFetchingRef.current.delete(item.id);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [draftStateById, filteredFiles, visibleThumbIds]);

  const createFileOnServer = useCallback(
    async (
      name: string,
      initialScene?: { elements: unknown[]; appState: unknown; files: unknown },
    ): Promise<string> => {
      debugLog.fileList("createFileOnServer", {
        name,
        folderId: currentFolderId,
        hasScene: !!initialScene,
        elements: initialScene ? (initialScene.elements as unknown[]).length : 0,
      });
      const created = await ServerSync.createFile(name, currentFolderId);
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
          debugLog.thumbnail(
            `createFileOnServer ${id.slice(0, 8)}, svgLen=${thumbnail.length}`,
          );
        } catch (err) {
          debugLog.thumbnail(
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
        debugLog.fileList(
          `createFileOnServer ${id.slice(0, 8)} saved, thumb=${!!thumbnail}`,
        );
      }

      return id;
    },
    [currentFolderId],
  );

  const handleCreate = async () => {
    try {
      const id = await createFileOnServer("Untitled");
      onOpenFile(id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const importExcalidrawToServer = useCallback(
    async (file: File) => {
      debugLog.fileList("import start", {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      setImporting(true);
      setError(null);
      try {
        const { elements, appState, files: sceneFiles } =
          await loadExcalidrawFileAsServerSceneData(file);
        debugLog.fileList("import parsed", {
          elements: elements.length,
          files: Object.keys(sceneFiles).length,
        });
        await createFileOnServer(sanitizeFileBaseName(file.name), {
          elements,
          appState,
          files: sceneFiles,
        });
        await refresh({ silent: true });
      } catch (e: unknown) {
        debugLog.fileList("import error", e);
        setError(formatImportErrorMessage(e));
      } finally {
        setImporting(false);
      }
    },
    [createFileOnServer, refresh],
  );

  const onRootDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) {
      return;
    }
    e.preventDefault();
    setDropOverlay(true);
  };

  const onRootDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) {
      return;
    }
    setDropOverlay(false);
  };

  const onRootDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onRootDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) {
      return;
    }
    e.preventDefault();
    setDropOverlay(false);
    if (importing) {
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    window.setTimeout(() => {
      void importExcalidrawToServer(file);
    }, 0);
  };

  const onSceneImportInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    window.setTimeout(() => {
      void importExcalidrawToServer(file);
    }, 0);
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: string,
    name: string,
  ) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"?`)) {
      return;
    }
    try {
      await ServerSync.deleteFile(id);
      FileSyncState.clearLocalCache(id);
      FileSyncState.clearHashStateForFile(id);
      LocalThumbnailCache.clear(id);
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

  const openDetail = (e: React.MouseEvent, f: ServerFile) => {
    e.stopPropagation();
    setDetailFile(f);
  };

  const selectFolder = (folderId: string | null) => {
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

  const saveCurrentOrder = useCallback(
    async (nextItems: FileOrderItem[]) => {
      try {
        await ServerSync.saveOrder(currentFolderId, nextItems);
        await refresh({ silent: true });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [currentFolderId, refresh],
  );

  const orderItems = useMemo<FileOrderItem[]>(
    () => [
      ...childFolders.map((folder) => ({ type: "folder" as const, id: folder.id })),
      ...filteredFiles.map((file) => ({ type: "file" as const, id: file.id })),
    ],
    [childFolders, filteredFiles],
  );

  const reorderInsert = useCallback(
    (source: DragItem, targetKey: string | null, edge: "left" | "right") => {
      if (!canReorder) {
        return;
      }
      const sourceKey = dragItemKey(source);
      if (sourceKey === targetKey) {
        return;
      }
      const withoutSource = orderItems.filter(
        (item) => dragItemKey(item) !== sourceKey,
      );
      const next = [...withoutSource];
      if (!targetKey) {
        next.push(source);
      } else {
        const targetIndex = next.findIndex(
          (item) => dragItemKey(item) === targetKey,
        );
        if (targetIndex < 0) {
          next.push(source);
        } else {
          const insertAt = edge === "left" ? targetIndex : targetIndex + 1;
          next.splice(insertAt, 0, source);
        }
      }
      setFolders((prev) =>
        prev.map((folder) => {
          const index = next.findIndex(
            (item) => item.type === "folder" && item.id === folder.id,
          );
          return index >= 0
            ? { ...folder, parent_id: currentFolderId, sort_index: index }
            : folder;
        }),
      );
      setFiles((prev) =>
        prev.map((file) => {
          const index = next.findIndex(
            (item) => item.type === "file" && item.id === file.id,
          );
          return index >= 0
            ? { ...file, folder_id: currentFolderId, sort_index: index }
            : file;
        }),
      );
      void saveCurrentOrder(next);
    },
    [canReorder, currentFolderId, orderItems, saveCurrentOrder],
  );

  const moveDragItemToFolder = useCallback(
    async (item: DragItem, folderId: string | null) => {
      try {
        if (item.type === "file") {
          await ServerSync.moveFiles([item.id], folderId);
        } else {
          await ServerSync.moveFolder(item.id, folderId);
        }
        await refresh({ silent: true });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [refresh],
  );

  // ── Desktop native DnD handlers ──

  const startNativeDrag = (e: React.DragEvent, item: DragItem) => {
    if (!canReorder) {
      e.preventDefault();
      return;
    }
    setDragItem(item);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(INTERNAL_DRAG_MIME, JSON.stringify(item));
    e.dataTransfer.setData("text/plain", dragItemKey(item));
  };

  const onGridCardDragOver = (
    e: React.DragEvent,
    item: DragItem,
    isFolder: boolean,
  ) => {
    if (!dragItem || !canReorder) {
      return;
    }
    const sourceKey = dragItemKey(dragItem);
    const key = dragItemKey(item);
    if (sourceKey === key) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropIndicator(null);
      setDropIntoFolder(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const el = e.currentTarget as HTMLElement;
    const zone = computeDropZone(e.clientX, el, isFolder);
    if (zone === "center" && isFolder) {
      setDropIndicator(null);
      setDropIntoFolder(item.id);
    } else {
      setDropIntoFolder(null);
      setDropIndicator({ key, edge: zone as "left" | "right" });
    }
  };

  const onGridCardDrop = (e: React.DragEvent) => {
    if (!dragItem || !canReorder) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    if (dropIntoFolder) {
      void moveDragItemToFolder(dragItem, dropIntoFolder);
      clearDragState();
      return;
    }

    if (dropIndicator) {
      reorderInsert(dragItem, dropIndicator.key, dropIndicator.edge);
      clearDragState();
      return;
    }

    const el = e.currentTarget as HTMLElement;
    const key = el.dataset.filelistDrag;
    if (key && key !== dragItemKey(dragItem)) {
      const isFolder = key.startsWith("folder:");
      const zone = computeDropZone(e.clientX, el, isFolder);
      if (zone === "center" && isFolder) {
        void moveDragItemToFolder(dragItem, key.split(":")[1]);
      } else {
        reorderInsert(dragItem, key, zone as "left" | "right");
      }
    }
    clearDragState();
  };

  const onSidebarDragOver = (
    e: React.DragEvent,
    folderId: string | null,
  ) => {
    if (!dragItem || !canReorder) {
      return;
    }
    e.preventDefault();
    setSidebarDropId(folderId === null ? SIDEBAR_ROOT : folderId);
  };

  const onSidebarDrop = async (
    e: React.DragEvent,
    folderId: string | null,
  ) => {
    if (!dragItem || !canReorder) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (folderId !== currentFolderId) {
      await moveDragItemToFolder(dragItem, folderId);
    }
    clearDragState();
  };

  const onBreadcrumbDrop = (
    e: React.DragEvent,
    folderId: string | null,
  ) => {
    void onSidebarDrop(e, folderId);
  };

  // ── Mobile Pointer Events long-press drag ──

  const onPointerDown = (e: React.PointerEvent, item: DragItem) => {
    if (!canReorder || e.pointerType === "mouse") {
      return;
    }
    longPressTimer.current = window.setTimeout(() => {
      suppressNextClickRef.current = true;
      setPointerDrag({
        item,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        active: true,
      });
      setDragItem(item);
    }, 260);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerDrag || pointerDrag.pointerId !== e.pointerId) {
      return;
    }
    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    const targetCard = targetEl?.closest<HTMLElement>("[data-filelist-drag]");
    const targetSidebarFolder = targetEl?.closest<HTMLElement>("[data-sidebar-drop]");

    if (targetCard?.dataset.filelistDrag) {
      const key = targetCard.dataset.filelistDrag;
      const sourceKey = dragItemKey(pointerDrag.item);
      if (key === sourceKey) {
        setDropIndicator(null);
        setDropIntoFolder(null);
        return;
      }
      const isFolder = key.startsWith("folder:");
      const zone = computeDropZone(e.clientX, targetCard, isFolder);
      if (zone === "center" && isFolder) {
        setDropIndicator(null);
        setDropIntoFolder(key.split(":")[1]);
      } else {
        setDropIntoFolder(null);
        setDropIndicator({ key, edge: zone as "left" | "right" });
      }
      setSidebarDropId(null);
    } else if (targetSidebarFolder) {
      setDropIndicator(null);
      setDropIntoFolder(null);
      const folderId = targetSidebarFolder.dataset.sidebarDrop;
      setSidebarDropId(folderId === "" ? SIDEBAR_ROOT : (folderId ?? null));
    } else {
      setDropIndicator(null);
      setDropIntoFolder(null);
      setSidebarDropId(null);
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!pointerDrag || pointerDrag.pointerId !== e.pointerId) {
      return;
    }
    if (dropIntoFolder) {
      await moveDragItemToFolder(pointerDrag.item, dropIntoFolder);
    } else if (dropIndicator) {
      const sourceKey = dragItemKey(pointerDrag.item);
      if (dropIndicator.key !== sourceKey) {
        reorderInsert(pointerDrag.item, dropIndicator.key, dropIndicator.edge);
      }
    } else if (sidebarDropId != null) {
      const targetFolderId = sidebarDropId === SIDEBAR_ROOT ? null : sidebarDropId;
      if (targetFolderId !== currentFolderId) {
        await moveDragItemToFolder(pointerDrag.item, targetFolderId);
      }
    }
    setPointerDrag(null);
    clearDragState();
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
      return (
        <div key={folder.id} className="filelist__tree-node">
          <div
            className={`filelist__tree-row ${
              active ? "filelist__tree-row--active" : ""
            } ${
              sidebarDropId === folder.id ? "filelist__tree-row--drop" : ""
            }`}
            style={{ paddingLeft: `${0.75 + depth * 0.9}rem` }}
            data-sidebar-drop={folder.id}
            onDragOver={(e) => onSidebarDragOver(e, folder.id)}
            onDrop={(e) => void onSidebarDrop(e, folder.id)}
          >
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
          {expanded && renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  };

  const renderTreePanel = () => (
    <aside className="filelist__sidebar">
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
        className={`filelist__tree-root ${
          currentFolderId === ROOT_ID ? "filelist__tree-root--active" : ""
        } ${sidebarDropId === SIDEBAR_ROOT ? "filelist__tree-row--drop" : ""}`}
        data-sidebar-drop=""
        onClick={() => selectFolder(ROOT_ID)}
        onDragOver={(e) => onSidebarDragOver(e, ROOT_ID)}
        onDrop={(e) => void onSidebarDrop(e, ROOT_ID)}
      >
        <Icon type="grid" size={16} />
        全部文件
      </button>
      <div className="filelist__tree">{renderFolderTree(ROOT_ID)}</div>
    </aside>
  );

  const indicatorClassFor = (key: string): string => {
    if (!dropIndicator || dropIndicator.key !== key) return "";
    if (dragItem && dragItemKey(dragItem) === key) return "";
    return `filelist__item--indicator-${dropIndicator.edge}`;
  };

  const renderFolderCard = (folder: ServerFolder) => {
    const isDropInto = dropIntoFolder === folder.id;
    return (
      <button
        key={folder.id}
        type="button"
        className={[
          "filelist__folder-card",
          isDropInto ? "filelist__folder-card--drop-into" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => selectFolder(folder.id)}
        onDragOver={(e) => {
          if (dragItem && canReorder) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setDropIntoFolder(folder.id);
            setDropIndicator(null);
          }
        }}
        onDragLeave={() => {
          if (dropIntoFolder === folder.id) {
            setDropIntoFolder(null);
          }
        }}
        onDrop={(e) => {
          if (dragItem && canReorder && dropIntoFolder === folder.id) {
            e.preventDefault();
            e.stopPropagation();
            void moveDragItemToFolder(dragItem, folder.id);
            clearDragState();
          }
        }}
      >
        <span className="filelist__folder-card-icon">
          <Icon type="folder" size={18} />
        </span>
        <span className="filelist__folder-card-name">{folder.name}</span>
      </button>
    );
  };

  const renderFileCard = (f: ServerFile, index: number) => {
    const state = draftStateById[f.id];
    const syncState = state?.syncState ?? "synced";
    const localDraftThumb = state?.localDraftThumb ?? null;
    const generatedDraftThumb =
      syncState === "draft" ? draftThumbs[f.id] : null;
    const hasDraftLocalState = state?.hasDraftLocalState ?? false;
    const thumbSvg = hasDraftLocalState
      ? localDraftThumb || generatedDraftThumb || null
      : localDraftThumb ||
        generatedDraftThumb ||
        fetchedThumbs[f.id] ||
        f.thumbnail_svg ||
        null;
    const q = searchQuery.trim();
    const key = `file:${f.id}`;
    const indicatorCls = indicatorClassFor(key);
    const thumbLoading = !thumbSvg && f.has_thumbnail && visibleThumbIds.has(f.id);
    return (
      <div
        key={f.id}
        className={[
          "filelist__card",
          indicatorCls,
          canReorder ? "filelist__card--draggable" : "",
        ].filter(Boolean).join(" ")}
        style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
        draggable={canReorder}
        data-filelist-drag={key}
        onClick={() => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          onOpenFile(f.id);
        }}
        onDragStart={(e) => startNativeDrag(e, { type: "file", id: f.id })}
        onDragEnd={clearDragState}
        onDragOver={(e) => onGridCardDragOver(e, { type: "file", id: f.id }, false)}
        onDrop={onGridCardDrop}
        onPointerDown={(e) => onPointerDown(e, { type: "file", id: f.id })}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => void onPointerUp(e)}
        onPointerCancel={onPointerUp}
      >
        <div
          className="filelist__card-thumb"
          data-thumb-file-id={f.id}
          ref={(node) => thumbRefCallback(node, f.id)}
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
                __html: patchThumbnailSvgForCard(thumbSvg),
              }}
            />
          ) : thumbLoading ? (
            <div className="filelist__card-thumb-loading" />
          ) : (
            <div className="filelist__card-thumb-placeholder">
              <Icon type="file" size={40} />
            </div>
          )}
          <div className="filelist__card-actions">
            <button
              className="filelist__card-action"
              title="详情"
              onClick={(e) => openDetail(e, f)}
            >
              <Icon type="info" size={16} />
            </button>
            <button
              className="filelist__card-action"
              title="打开"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(f.id);
              }}
            >
              <Icon type="open" size={16} />
            </button>
            <button
              className="filelist__card-action"
              title="重命名"
              onClick={(e) => startRename(e, f.id, f.name)}
            >
              <Icon type="edit" size={16} />
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
                title={f.name}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(f.id);
                  setRenameValue(f.name);
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

  return (
    <div
      ref={rootRef}
      className={`filelist ${pointerDrag?.active ? "filelist--dragging" : ""}`}
      onDragEnter={onRootDragEnter}
      onDragLeave={onRootDragLeave}
      onDragOver={onRootDragOver}
      onDrop={onRootDrop}
    >
      {dropOverlay && (
        <div className="filelist__drop-overlay" aria-hidden>
          <div className="filelist__drop-card">
            <Icon type="plus" size={40} />
            <p className="filelist__drop-title">松手以导入</p>
            <p className="filelist__drop-hint">
              支持 .excalidraw / JSON 等，导入到服务器并加入当前文件夹
            </p>
          </div>
        </div>
      )}
      {importing && (
        <div className="filelist__import-blocking" aria-busy>
          <span>正在导入…</span>
        </div>
      )}
      <header className="filelist__header">
        <div className="filelist__header-left">
          <button
            type="button"
            className="filelist__mobile-menu"
            onClick={() => setMobileTreeOpen(true)}
            aria-label="打开文件夹"
          >
            <Icon type="menu" size={20} />
          </button>
          <Icon type="grid" size={22} />
          <h1 className="filelist__title">Excalidraw 私有部署</h1>
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
                <option value="manual">自定义排序</option>
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
            <input
              ref={sceneImportInputRef}
              type="file"
              accept=".excalidraw,.json,.png,.svg,application/vnd.excalidraw+json,application/json,image/png,image/svg+xml"
              className="filelist__file-input"
              aria-hidden
              tabIndex={-1}
              onChange={onSceneImportInputChange}
            />
            <button
              type="button"
              className="filelist__import-scene-btn"
              disabled={importing}
              onClick={() => sceneImportInputRef.current?.click()}
            >
              <Icon type="upload" size={18} />
              导入
            </button>
            <button className="filelist__new-btn" onClick={handleCreate}>
              <Icon type="plus" size={18} />
              新建
            </button>
          </div>
        </div>
      </header>

      {error && <div className="filelist__error">{error}</div>}

      <div className="filelist__shell">
        {renderTreePanel()}
        <main className="filelist__main">
          <div className="filelist__pathbar">
            <div className="filelist__breadcrumbs">
              <button
                type="button"
                data-sidebar-drop=""
                onClick={() => selectFolder(ROOT_ID)}
                onDragOver={(e) => onSidebarDragOver(e, ROOT_ID)}
                onDrop={(e) => onBreadcrumbDrop(e, ROOT_ID)}
              >
                全部文件
              </button>
              {currentPath.map((folder) => (
                <React.Fragment key={folder.id}>
                  <span>/</span>
                  <button
                    type="button"
                    data-sidebar-drop={folder.id}
                    onClick={() => selectFolder(folder.id)}
                    onDragOver={(e) => onSidebarDragOver(e, folder.id)}
                    onDrop={(e) => onBreadcrumbDrop(e, folder.id)}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <div className="filelist__path-actions">
              {currentFolder && (
                <button
                  type="button"
                  className="filelist__import-scene-btn"
                  onClick={() => startRenameFolder(currentFolder)}
                >
                  <Icon type="edit" size={16} />
                  重命名
                </button>
              )}
              <button
                type="button"
                className="filelist__import-scene-btn"
                onClick={() => startCreateFolder(currentFolderId)}
              >
                <Icon type="folder" size={16} />
                新建文件夹
              </button>
            </div>
          </div>
          {customSortEnabled && searchActive && (
            <div className="filelist__hint">清空搜索后可拖拽调整顺序。</div>
          )}
          {!searchActive && !loading && childFolders.length > 0 && (
            <div className="filelist__folder-row">
              {childFolders.map(renderFolderCard)}
            </div>
          )}
          {loading ? (
            <div className="filelist__grid">
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
                <button className="filelist__new-btn" onClick={handleCreate}>
                  <Icon type="plus" size={18} />
                  创建第一个画布
                </button>
              )}
            </div>
          ) : (
            <div
              className="filelist__grid"
              onDragOver={(e) => {
                if (dragItem && canReorder) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(e) => {
                if (dragItem && canReorder) {
                  e.preventDefault();
                  reorderInsert(dragItem, null, "right");
                  clearDragState();
                }
              }}
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
            onClick={() => setMobileTreeOpen(false)}
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
          onClick={() => setFolderDraft(null)}
        >
          <div
            className="filelist__detail-card"
            onClick={(e) => e.stopPropagation()}
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

      {detailFile && (
        <div
          className="filelist__detail-overlay"
          role="dialog"
          aria-modal
          onClick={() => setDetailFile(null)}
        >
          <div
            className="filelist__detail-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="filelist__detail-title">文件详情</h2>
            <dl className="filelist__detail-dl">
              <dt>名称</dt>
              <dd>{detailFile.name}</dd>
              <dt>ID</dt>
              <dd className="filelist__detail-mono">{detailFile.id}</dd>
              <dt>文件夹</dt>
              <dd>
                {detailFile.folder_id
                  ? foldersById.get(detailFile.folder_id)?.name ?? "未知"
                  : "全部文件"}
              </dd>
              <dt>创建</dt>
              <dd>{new Date(detailFile.created_at).toLocaleString()}</dd>
              <dt>更新</dt>
              <dd>{new Date(effectiveUpdatedAt(detailFile)).toLocaleString()}</dd>
              <dt>存档数</dt>
              <dd>{detailFile.archive_count ?? 0}</dd>
              <dt>同步状态</dt>
              <dd>
                {
                  {
                    synced: "已同步",
                    draft: "有未保存编辑",
                  }[FileSyncState.getSyncState(detailFile.id)]
                }
              </dd>
            </dl>
            <div className="filelist__detail-actions">
              <button
                type="button"
                className="filelist__new-btn"
                onClick={() => {
                  onOpenFile(detailFile.id);
                  setDetailFile(null);
                }}
              >
                打开编辑
              </button>
              <button
                type="button"
                className="filelist__import-scene-btn"
                onClick={() => setDetailFile(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
