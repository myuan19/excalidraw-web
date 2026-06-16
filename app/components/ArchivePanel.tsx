import React, { useCallback, useEffect, useState } from "react";

import {
  isContentHashArchived,
  readCurrentFileContentHash,
} from "../data/archiveVersionMatch";
import { isAutoSaveLabel } from "../data/autoSaveSession";
import { getCheckpointLabelText } from "../data/checkpointPolicy";
import { ServerSync, type ArchiveEntry } from "../data/ServerSync";

import {
  useFileDraftStatus,
  type FileDraftStatus,
} from "../hooks/useFileDraftStatus";

import {
  ArchivePanelPrompt,
  type ArchivePanelPromptChoice,
  type ArchivePanelPromptMode,
} from "./ArchivePanelPrompt";

import "./ExcalToolbar.scss";

interface ArchivePanelProps {
  fileId: string;
  onSave: () => void | Promise<void>;
  onArchive: () => Promise<boolean>;
  onAfterRestore: () => void | Promise<void>;
  onClose: () => void;
  onPrepareAction?: () => void;
  saving?: boolean;
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

function getCurrentVersionStatusLabel(status: FileDraftStatus): string {
  if (status === "draft") {
    return "未同步";
  }
  if (status === "synced") {
    return "已同步";
  }
  return "";
}

function getCurrentVersionStatusHint(status: FileDraftStatus): string | null {
  if (status === "draft") {
    return "本地内容与服务器版本不一致";
  }
  if (status === "synced") {
    return "本地内容与服务器版本一致";
  }
  return null;
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({
  fileId,
  onSave,
  onArchive,
  onAfterRestore,
  onClose,
  onPrepareAction,
  saving = false,
}) => {
  const [versions, setVersions] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLabel, setActionLabel] = useState<"save" | "archive" | null>(
    null,
  );
  const [panelBusy, setPanelBusy] = useState(false);
  const [promptMode, setPromptMode] = useState<ArchivePanelPromptMode | null>(
    null,
  );
  const { status: draftStatus, unsaved } = useFileDraftStatus(fileId);
  const currentStatusLabel = getCurrentVersionStatusLabel(draftStatus);
  const currentStatusHint = getCurrentVersionStatusHint(draftStatus);
  const actionsDisabled = saving || panelBusy || actionLabel !== null;

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

  const isCurrentVersionArchived = () => {
    onPrepareAction?.();
    const contentHash = readCurrentFileContentHash(fileId);
    return isContentHashArchived(versions, contentHash);
  };

  const handleSave = async () => {
    if (actionsDisabled) {
      return;
    }
    setActionLabel("save");
    try {
      await onSave();
    } finally {
      setActionLabel(null);
    }
  };

  const executeArchive = async (): Promise<boolean> => {
    setActionLabel("archive");
    try {
      const ok = await onArchive();
      if (ok) {
        await refresh({ silent: true });
      }
      return ok;
    } finally {
      setActionLabel(null);
    }
  };

  const handleArchive = async () => {
    if (actionsDisabled) {
      return;
    }
    if (unsaved) {
      setPromptMode({ type: "archive" });
      return;
    }
    await executeArchive();
  };

  const performRestore = async (archiveId: string) => {
    await ServerSync.restoreArchive(fileId, archiveId, {
      backupCurrent: false,
    });
    await onAfterRestore();
    await refresh({ silent: true });
  };

  const handleRestoreClick = async (archiveId: string) => {
    if (actionsDisabled) {
      return;
    }
    if (isCurrentVersionArchived()) {
      setPanelBusy(true);
      try {
        await performRestore(archiveId);
      } catch (e: any) {
        alert(`恢复失败：${e.message}`);
      } finally {
        setPanelBusy(false);
      }
      return;
    }
    setPromptMode({ type: "restore", archiveId });
  };

  const handlePromptChoice = async (choice: ArchivePanelPromptChoice) => {
    if (!promptMode || choice === "cancel") {
      setPromptMode(null);
      return;
    }

    if (promptMode.type === "archive") {
      if (choice !== "yes") {
        setPromptMode(null);
        return;
      }
      setPanelBusy(true);
      try {
        const ok = await executeArchive();
        if (ok) {
          setPromptMode(null);
        }
      } finally {
        setPanelBusy(false);
      }
      return;
    }

    if (promptMode.type === "delete") {
      if (choice !== "yes") {
        setPromptMode(null);
        return;
      }
      const archiveId = promptMode.archiveId;
      setPanelBusy(true);
      try {
        await ServerSync.deleteArchive(fileId, archiveId);
        await refresh({ silent: true });
        setPromptMode(null);
      } catch (e: any) {
        alert(`删除失败：${e.message}`);
      } finally {
        setPanelBusy(false);
      }
      return;
    }

    const archiveId = promptMode.archiveId;
    setPanelBusy(true);
    try {
      if (choice === "yes") {
        const archived = await executeArchive();
        if (!archived) {
          return;
        }
      }
      await performRestore(archiveId);
      setPromptMode(null);
    } catch (e: any) {
      alert(`恢复失败：${e.message}`);
    } finally {
      setPanelBusy(false);
    }
  };

  const handleDeleteClick = (archiveId: string) => {
    if (actionsDisabled) {
      return;
    }
    setPromptMode({ type: "delete", archiveId });
  };

  return (
    <>
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
            <span id="nb-history-title">存档</span>
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
            <div className="nb-history-item nb-history-item--current">
              <div className="nb-history-info">
                <span className="nb-history-time" style={{ fontWeight: 600 }}>
                  当前版本
                </span>
                {currentStatusLabel ? (
                  <div className="nb-history-sync-status">
                    <span
                      className={
                        unsaved
                          ? "nb-history-badge nb-history-badge--unsaved"
                          : "nb-history-badge nb-history-badge--synced"
                      }
                    >
                      {currentStatusLabel}
                    </span>
                    {currentStatusHint ? (
                      <span className="nb-history-sync-hint">
                        {currentStatusHint}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="nb-history-actions">
                <button
                  type="button"
                  className="nb-history-action"
                  disabled={actionsDisabled}
                  onClick={() => void handleSave()}
                >
                  {actionLabel === "save" ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  className="nb-history-action nb-history-archive"
                  disabled={actionsDisabled}
                  onClick={() => void handleArchive()}
                >
                  {actionLabel === "archive" ? "存档中…" : "存档"}
                </button>
              </div>
            </div>

            {loading && (
              <div className="nb-history-item nb-history-item--message">
                <span className="nb-history-time">加载中…</span>
              </div>
            )}

            {!loading && versions.length > 0 && (
              <div className="nb-history-section-label">已归档版本</div>
            )}

            {!loading && versions.length === 0 && (
              <div className="nb-history-item nb-history-item--message">
                <span className="nb-history-time">暂无已归档版本</span>
              </div>
            )}

            {!loading &&
              versions.map((a) => {
                const badgeText = getArchiveBadgeText(a.label);
                return (
                  <div key={a.id} className="nb-history-item">
                    <div className="nb-history-info">
                      <span
                        className="nb-history-time"
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
                    <div className="nb-history-actions">
                      <button
                        type="button"
                        className="nb-history-action nb-history-restore"
                        disabled={actionsDisabled}
                        onClick={() => void handleRestoreClick(a.id)}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="nb-history-action nb-history-delete"
                        disabled={actionsDisabled}
                        onClick={() => handleDeleteClick(a.id)}
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
      <ArchivePanelPrompt
        mode={promptMode}
        busy={panelBusy || actionLabel !== null}
        onChoice={(choice) => void handlePromptChoice(choice)}
      />
    </>
  );
};
