import React, { useCallback, useEffect, useState } from "react";

import { ServerSync, type ArchiveEntry } from "../data/ServerSync";
import { useFileDraftStatus } from "../hooks/useFileDraftStatus";
import { isAutoSaveLabel } from "../data/autoSaveSession";
import { getCheckpointLabelText } from "../data/checkpointPolicy";

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
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate(),
    )} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

function getArchiveBadgeText(label: string): string {
  if (isAutoSaveLabel(label)) {
    return "旧自动保存";
  }
  return getCheckpointLabelText(label);
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({
  fileId,
  onAfterRestore,
  onClose,
}) => {
  const [versions, setVersions] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
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
    return () => window.removeEventListener("excalidraw-server-saved", onSaved);
  }, [refresh]);

  const handleRestore = async (archiveId: string) => {
    if (
      !window.confirm(
        "将 latest 恢复为该 checkpoint？恢复前会自动备份当前 latest（如果尚未存档）。当前未保存到 latest 的本地编辑仍会丢失。",
      )
    ) {
      return;
    }
    try {
      await ServerSync.restoreArchive(fileId, archiveId, {
        backupCurrent: true,
      });
      await onAfterRestore();
      await refresh({ silent: true });
    } catch (e: any) {
      alert(`恢复失败：${e.message}`);
    }
  };

  return (
    <div
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
              当前 / Latest
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
              <span className="nb-history-time">暂无 checkpoint</span>
            </div>
          )}

          {!loading &&
            versions.map((a, i) => {
              const badgeText = getArchiveBadgeText(a.label);
              return (
                <div key={a.id} className="nb-history-item">
                  <div className="nb-history-info">
                    <span
                      className="nb-history-time"
                      style={i === 0 ? { fontWeight: 600 } : undefined}
                    >
                      {formatVersionTime(a.created_at)}
                      {badgeText && (
                        <span className="nb-history-badge nb-history-badge--auto">
                          {badgeText}
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="nb-history-restore"
                    onClick={() => void handleRestore(a.id)}
                  >
                    恢复
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
