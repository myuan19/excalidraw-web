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
  FILE_LIST_THUMB_EXPORT_PADDING,
  appStateForThumbnailExport,
} from "../data/thumbnailExport";
import { ServerSync, type ServerFile } from "../data/ServerSync";
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

function sanitizeFileBaseName(name: string): string {
  const base =
    name.replace(/\.(excalidraw|json|png|svg)$/i, "").trim() || "Imported";
  return base.slice(0, 120);
}

type SortKey = "updated_at" | "created_at" | "name";

/** Force SVG to fill & crop in the card thumbnail area. */
function patchSvgFillCrop(svgMarkup: string): string {
  return svgMarkup
    .replace(/\s+preserveAspectRatio="[^"]*"/gi, "")
    .replace(
      /(<svg\b[^>]*?)(\s*>)/i,
      '$1 preserveAspectRatio="xMidYMid slice"$2',
    );
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

export const FileList: React.FC<FileListProps> = ({ onOpenFile, onReady }) => {
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dropOverlay, setDropOverlay] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneImportInputRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameClickTimer = useRef<number | null>(null);
  const [, syncBump] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [showAISettings, setShowAISettings] = useState(false);
  const [detailFile, setDetailFile] = useState<ServerFile | null>(null);
  const [aiDotOk, setAiDotOk] = useState(false);

  useEffect(() => {
    const syncAiDot = () => setAiDotOk(isAIConfigured());
    ensureAIConfigLoaded().then(syncAiDot).catch(syncAiDot);
    return subscribeAIConfig(syncAiDot);
  }, []);

  useEffect(() => {
    return () => {
      if (nameClickTimer.current != null) {
        window.clearTimeout(nameClickTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const bump = () => syncBump((n) => n + 1);
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

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
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
      const list = await ServerSync.listFiles({ signal: ac.signal });
      if (ac.signal.aborted) {
        return;
      }
      setFiles(list);
      for (const f of list) {
        if (f.content_sha256) {
          FileSyncState.setServerHash(f.id, f.content_sha256);
        }
      }
      debugLog.fileList("refresh done", {
        count: list.length,
        withThumb: list.filter((x) => x.has_thumbnail || x.thumbnail_svg).length,
        withSha: list.filter((x) => x.content_sha256).length,
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
      if (!ac.signal.aborted) {
        if (!options?.silent) {
          setLoading(false);
        }
      }
      if (inflightRef.current === ac) {
        inflightRef.current = null;
      }
    }
  }, [onReady]);

  useEffect(() => {
    const onListRefresh = () => {
      debugLog.fileList("excalidraw-file-list-refresh → refresh()");
      void refresh();
    };
    window.addEventListener("excalidraw-file-list-refresh", onListRefresh);
    return () =>
      window.removeEventListener("excalidraw-file-list-refresh", onListRefresh);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!flash) {
      return;
    }
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = files.filter((f) => f.name.toLowerCase().includes(q));
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
  }, [files, searchQuery, sortKey, effectiveUpdatedAt]);

  const handleCreate = async () => {
    try {
      const f = await ServerSync.createFile("Untitled");
      onOpenFile(f.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const importExcalidrawToServer = useCallback(
    async (file: File) => {
      setImporting(true);
      setError(null);
      try {
        const { elements, appState, files: sceneFiles } =
          await loadExcalidrawFileAsServerSceneData(file);
        const displayName = sanitizeFileBaseName(file.name);
        const created = await ServerSync.createFile(displayName);
        const scene = { elements, appState, files: sceneFiles };

        let thumbnail: string | undefined;
        try {
          const { exportToSvg } = await import("@excalidraw/excalidraw");
          const svg = await exportToSvg({
            elements: elements as any,
            appState: appStateForThumbnailExport(appState as any),
            files: sceneFiles as any,
            exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
          });
          thumbnail = svg.outerHTML;
          LocalThumbnailCache.set(created.id, thumbnail);
        } catch {
          // thumbnail generation is optional
        }

        await ServerSync.saveFileImmediate(
          created.id,
          scene,
          displayName,
          thumbnail,
        );
        setError(null);
        setFlash({
          ok: true,
          message: `已导入「${displayName}」，已保存到服务器（未打开）`,
        });
        await refresh({ silent: true });
      } catch (e: unknown) {
        const msg = formatImportErrorMessage(e);
        setFlash({ ok: false, message: msg });
        setError(msg);
      } finally {
        setImporting(false);
      }
    },
    [refresh],
  );

  const onRootDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) {
      return;
    }
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
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onRootDrop = (e: React.DragEvent) => {
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
    // Defer off the change event so the native picker can finish closing without
    // competing with heavy parse/save work on the same stack (reduces tab freezes).
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
      refresh();
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

  return (
    <div
      ref={rootRef}
      className="filelist"
      onDragEnter={onRootDragEnter}
      onDragLeave={onRootDragLeave}
      onDragOver={onRootDragOver}
      onDrop={onRootDrop}
    >
      {dropOverlay && (
        <div className="filelist__drop-overlay" aria-hidden>
          <div className="filelist__drop-card">
            <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden>
              <path
                fill="currentColor"
                d="M19 13h-4v4h-2v-4H9v-2h4V7h2v4h4v2zm-7-9c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
              />
            </svg>
            <p className="filelist__drop-title">松手以导入</p>
            <p className="filelist__drop-hint">
              支持 .excalidraw / JSON 等，上传到服务器并加入列表（不自动打开）
            </p>
          </div>
        </div>
      )}
      {importing && (
        <div className="filelist__import-blocking" aria-busy>
          <span>正在导入…</span>
        </div>
      )}
      {flash && (
        <div
          className={`filelist__flash filelist__flash--${
            flash.ok ? "ok" : "err"
          }`}
          role="status"
        >
          {flash.message}
        </div>
      )}
      <header className="filelist__header">
        <div className="filelist__header-left">
          <svg
            className="filelist__logo"
            viewBox="0 0 24 24"
            width="28"
            height="28"
          >
            <path
              fill="currentColor"
              d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"
              opacity=".8"
            />
          </svg>
          <h1 className="filelist__title">Excalidraw 私有部署</h1>
        </div>
        <div className="filelist__header-right">
          <div className="filelist__search-wrap">
            <svg
              className="filelist__search-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
            >
              <path
                fill="currentColor"
                d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              />
            </svg>
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
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path
                fill="currentColor"
                d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"
              />
            </svg>
            导入 Excalidraw
          </button>
          <button className="filelist__new-btn" onClick={handleCreate}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="currentColor"
                d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
              />
            </svg>
            新建
          </button>
        </div>
      </header>

      {error && <div className="filelist__error">{error}</div>}

      {loading ? (
        <div className="filelist__status">Loading...</div>
      ) : filteredFiles.length === 0 ? (
        <div className="filelist__empty">
          <svg
            viewBox="0 0 96 96"
            width="96"
            height="96"
            className="filelist__empty-icon"
          >
            <rect
              x="16"
              y="12"
              width="64"
              height="72"
              rx="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="28"
              y1="36"
              x2="68"
              y2="36"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="28"
              y1="48"
              x2="56"
              y2="48"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="28"
              y1="60"
              x2="48"
              y2="60"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <p className="filelist__empty-text">
            {searchQuery ? "没有匹配的文件" : "暂无画布"}
          </p>
          {!searchQuery && (
            <button className="filelist__new-btn" onClick={handleCreate}>
              创建第一个画布
            </button>
          )}
        </div>
      ) : (
        <div className="filelist__grid">
          {filteredFiles.map((f) => {
            const syncState = FileSyncState.getSyncState(f.id);
            const localSvg = LocalThumbnailCache.get(f.id);
            const legacyInline = f.thumbnail_svg;
            const remoteThumb = f.has_thumbnail
              ? `/api/files/${f.id}/thumbnail${
                  f.content_sha256
                    ? `?h=${encodeURIComponent(f.content_sha256)}`
                    : ""
                }`
              : null;
            const thumbSvg = localSvg || legacyInline;
            const q = searchQuery.trim();
            return (
              <div
                key={f.id}
                className="filelist__card"
                onClick={() => onOpenFile(f.id)}
              >
                <div className="filelist__card-thumb">
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
                        __html: patchSvgFillCrop(thumbSvg),
                      }}
                    />
                  ) : remoteThumb ? (
                    <img
                      className="filelist__card-thumb-img"
                      src={remoteThumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="filelist__card-thumb-placeholder">
                      <svg viewBox="0 0 48 48" width="48" height="48">
                        <rect
                          x="8"
                          y="6"
                          width="32"
                          height="36"
                          rx="3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          opacity=".3"
                        />
                        <path
                          d="M16 20l6-6 10 10M14 30l8-6 12 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          opacity=".3"
                        />
                      </svg>
                    </div>
                  )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (nameClickTimer.current != null) {
                            window.clearTimeout(nameClickTimer.current);
                            nameClickTimer.current = null;
                          }
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
                      <span className="filelist__card-badge">
                        {f.archive_count} 存档
                      </span>
                    )}
                  </div>
                </div>
                <div className="filelist__card-actions">
                  <button
                    className="filelist__card-action"
                    title="详情"
                    onClick={(e) => openDetail(e, f)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                      />
                    </svg>
                  </button>
                  <button
                    className="filelist__card-action"
                    title="打开"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFile(f.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        fill="currentColor"
                        d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
                      />
                    </svg>
                  </button>
                  <button
                    className="filelist__card-action"
                    title="Rename"
                    onClick={(e) => startRename(e, f.id, f.name)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        fill="currentColor"
                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                      />
                    </svg>
                  </button>
                  <button
                    className="filelist__card-action"
                    title="Download"
                    onClick={(e) => handleDownload(e, f.id, f.name)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        fill="currentColor"
                        d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
                      />
                    </svg>
                  </button>
                  <button
                    className="filelist__card-action filelist__card-action--danger"
                    title="Delete"
                    onClick={(e) => handleDelete(e, f.id, f.name)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
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
