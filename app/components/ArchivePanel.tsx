import React, { useCallback, useEffect, useRef, useState } from "react";

import { ServerSync, type ArchiveEntry } from "../data/ServerSync";
import { useFileDraftStatus } from "../hooks/useFileDraftStatus";

import "./ExcalToolbar.scss";

interface ArchivePanelProps {
  fileId: string;
  onAfterRestore: () => void | Promise<void>;
  onClose: () => void;
}

function formatVersionTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({
  fileId,
  onAfterRestore,
  onClose,
}) => {
  const [versions, setVersions] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const { unsaved, label: draftStatusLabel } = useFileDraftStatus(fileId);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!fileId) {
        return;
      }
      if (!options?.silent) {
        setLoading(true);
      }
      try {
        const list = await ServerSync.listArchives(fileId);
        setVersions(list);
      } catch {
        // silently ignore
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [fileId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSaved = () => void refresh({ silent: true });
    window.addEventListener("excalidraw-server-saved", onSaved);
    return () =>
      window.removeEventListener("excalidraw-server-saved", onSaved);
  }, [refresh]);

  const handleRestore = async (archiveId: string) => {
    if (
      !window.confirm("将画布替换为该历史版本？当前未保存的编辑将丢失。")
    ) {
      return;
    }
    try {
      await ServerSync.restoreArchive(fileId, archiveId);
      await onAfterRestore();
    } catch (e: any) {
      alert(`恢复失败：${e.message}`);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="nb-history-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="nb-history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nb-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="nb-history-header">
          <span id="nb-history-title">历史版本</span>
          <button
            type="button"
            className="nb-history-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="nb-history-list">
          {/* 本地草稿 — 始终显示在最上方 */}
          <div className="nb-history-item nb-history-item--local">
            <span className="nb-history-time" style={{ fontWeight: 600 }}>
              本地草稿
            </span>
            <span
              className={
                unsaved
                  ? "nb-history-badge nb-history-badge--unsaved"
                  : "nb-history-badge nb-history-badge--synced"
              }
            >
              {draftStatusLabel}
            </span>
          </div>

          {loading && (
            <div className="nb-history-item">
              <span className="nb-history-time">加载中…</span>
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div className="nb-history-item">
              <span className="nb-history-time">暂无服务器版本</span>
            </div>
          )}

          {!loading &&
            versions.map((a, i) => (
              <div key={a.id} className="nb-history-item">
                <div className="nb-history-info">
                  <span
                    className="nb-history-time"
                    style={i === 0 ? { fontWeight: 600 } : undefined}
                  >
                    {i === 0 ? "最新提交" : formatVersionTime(a.created_at)}
                  </span>
                  {i === 0 && (
                    <span className="nb-history-sub">
                      {formatVersionTime(a.created_at)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="nb-history-restore"
                  onClick={() => void handleRestore(a.id)}
                >
                  恢复
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
