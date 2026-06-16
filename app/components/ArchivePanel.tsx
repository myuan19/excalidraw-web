import React, { useCallback, useEffect, useState } from "react";

import {
  resolveArchivePreview,
  type ArchivePreview,
} from "../data/archivePreview";
import { isAutoSaveLabel } from "../data/autoSaveSession";
import { getCheckpointLabelText } from "../data/checkpointPolicy";
import { ServerSync, type ArchiveEntry } from "../data/ServerSync";

import { useFileDraftStatus } from "../hooks/useFileDraftStatus";

import { FileCardThumb } from "./FileCardThumb";

import "./ExcalToolbar.scss";

interface ArchivePanelProps {
  fileId: string;
  onBeforeRestore?: () => boolean | Promise<boolean>;
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
  onBeforeRestore,
  onAfterRestore,
  onClose,
}) => {
  const [versions, setVersions] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewByArchiveId, setPreviewByArchiveId] = useState<
    Record<string, ArchivePreview | undefined>
  >({});
  const [previewLoadingByArchiveId, setPreviewLoadingByArchiveId] = useState<
    Record<string, boolean | undefined>
  >({});
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
        setPreviewByArchiveId((prev) => {
          const next: Record<string, ArchivePreview | undefined> = {};
          for (const archive of list) {
            if (prev[archive.id]) {
              next[archive.id] = prev[archive.id];
            }
          }
          return next;
        });
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

  useEffect(() => {
    let cancelled = false;
    const missingArchives = versions.filter(
      (archive) =>
        !previewByArchiveId[archive.id] &&
        !previewLoadingByArchiveId[archive.id],
    );

    if (missingArchives.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    setPreviewLoadingByArchiveId((prev) => {
      const next = { ...prev };
      for (const archive of missingArchives) {
        next[archive.id] = true;
      }
      return next;
    });

    missingArchives.forEach((archive) => {
      void resolveArchivePreview(fileId, archive)
        .then((preview) => {
          if (cancelled) {
            return;
          }
          setPreviewByArchiveId((prev) => ({
            ...prev,
            [archive.id]: preview,
          }));
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setPreviewByArchiveId((prev) => ({
            ...prev,
            [archive.id]: { kind: "excalidraw", cardThumbSvg: null },
          }));
        })
        .finally(() => {
          if (cancelled) {
            return;
          }
          setPreviewLoadingByArchiveId((prev) => ({
            ...prev,
            [archive.id]: false,
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [fileId, previewByArchiveId, previewLoadingByArchiveId, versions]);

  const handleRestore = async (archiveId: string) => {
    const shouldRestore = onBeforeRestore
      ? await onBeforeRestore()
      : window.confirm("将 latest 恢复为该 checkpoint？");
    if (!shouldRestore) {
      return;
    }
    try {
      await ServerSync.restoreArchive(fileId, archiveId, {
        backupCurrent: false,
      });
      await onAfterRestore();
      await refresh({ silent: true });
    } catch (e: any) {
      alert(`恢复失败：${e.message}`);
    }
  };

  const handleDelete = async (archiveId: string) => {
    if (!window.confirm("确认删除该 checkpoint？此操作不可恢复。")) {
      return;
    }
    try {
      await ServerSync.deleteArchive(fileId, archiveId);
      setPreviewByArchiveId((prev) => {
        const next = { ...prev };
        delete next[archiveId];
        return next;
      });
      setPreviewLoadingByArchiveId((prev) => {
        const next = { ...prev };
        delete next[archiveId];
        return next;
      });
      await refresh({ silent: true });
    } catch (e: any) {
      alert(`删除失败：${e.message}`);
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
          {/* 当前 latest 状态 — 始终显示在最上方 */}
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
            <div className="nb-history-item nb-history-item--message">
              <span className="nb-history-time">加载中…</span>
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div className="nb-history-item nb-history-item--message">
              <span className="nb-history-time">暂无 checkpoint</span>
            </div>
          )}

          {!loading &&
            versions.map((a, i) => {
              const badgeText = getArchiveBadgeText(a.label);
              const preview = previewByArchiveId[a.id];
              const previewLoading = !!previewLoadingByArchiveId[a.id];
              return (
                <div key={a.id} className="nb-history-item">
                  <div className="nb-history-info">
                    <span
                      className="nb-history-time"
                      style={i === 0 ? { fontWeight: 600 } : undefined}
                      title={formatVersionTime(a.created_at)}
                    >
                      {formatVersionTime(a.created_at)}
                    </span>
                    {badgeText ? (
                      <span className="nb-history-badge nb-history-badge--auto">
                        {badgeText}
                      </span>
                    ) : null}
                  </div>
                  <div className="nb-history-preview" aria-label="历史预览">
                    <FileCardThumb
                      kind={preview?.kind ?? "excalidraw"}
                      cardThumbSvg={preview?.cardThumbSvg ?? null}
                      thumbLoading={previewLoading}
                    />
                  </div>
                  <div className="nb-history-actions">
                    <button
                      type="button"
                      className="nb-history-action nb-history-restore"
                      onClick={() => void handleRestore(a.id)}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="nb-history-action nb-history-delete"
                      onClick={() => void handleDelete(a.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
