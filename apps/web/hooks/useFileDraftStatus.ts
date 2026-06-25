import { useEffect, useRef, useState } from "react";

import {
  readStoredFileModificationState,
  type FileModificationDraftStatus,
} from "../data/fileModificationState";
import { FileSyncState } from "../data/FileSyncState";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { LocalDraftSessions } from "../data/localDraftSessions";
import {
  readMindMapTraceFileState,
  traceMindMapDraftStatusTransition,
} from "../data/mindMapOperationTrace";
import { devDebug } from "../lib/devDebug";

/** 已入库文件相对服务器基线的状态文案 */
export const FILE_DRAFT_STATUS_LABEL = {
  draft: "未保存",
  synced: "无修改",
} as const;

/** 尚未写入本地文件夹的浏览器草稿（local-draft） */
export const LOCAL_DRAFT_STATUS_LABEL = "临时";

export type FileDraftStatus = FileModificationDraftStatus;

/** 读取当前文档相对服务器基线的草稿状态（唯一数据源：FileSyncState） */
export function readFileDraftStatus(fileId: string | null): FileDraftStatus {
  if (!fileId) {
    return "idle";
  }
  const kind = isLocalDraftFileId(fileId)
    ? LocalDraftSessions.get(fileId)?.kind
    : null;
  return readStoredFileModificationState(fileId, kind).draftStatus;
}

export function getFileDraftStatusLabel(
  status: FileDraftStatus,
  fileId?: string | null,
): string | null {
  if (status === "idle") {
    return null;
  }
  if (status === "synced") {
    return FILE_DRAFT_STATUS_LABEL.synced;
  }
  if (fileId && isLocalDraftFileId(fileId)) {
    return LOCAL_DRAFT_STATUS_LABEL;
  }
  return FILE_DRAFT_STATUS_LABEL.draft;
}

export function readFileDraftStatusLabel(fileId: string | null): string | null {
  return getFileDraftStatusLabel(readFileDraftStatus(fileId), fileId);
}

/**
 * 订阅 excalidraw-file-sync-state，与 ArchivePanel 本地草稿徽章使用同一判定逻辑。
 */
export function useFileDraftStatus(fileId: string | null) {
  const [, syncRevision] = useState(0);
  const previousStatusRef = useRef<FileDraftStatus | null>(null);

  useEffect(() => {
    const bump = () => syncRevision((revision) => revision + 1);
    window.addEventListener("excalidraw-file-sync-state", bump);
    return () => window.removeEventListener("excalidraw-file-sync-state", bump);
  }, []);

  const status = readFileDraftStatus(fileId);
  const label = getFileDraftStatusLabel(status, fileId);

  useEffect(() => {
    if (!fileId) {
      previousStatusRef.current = null;
      return;
    }
    const previousStatus = previousStatusRef.current;
    if (previousStatus !== null && previousStatus !== status) {
      traceMindMapDraftStatusTransition("ui.draftStatus.transition", {
        fileId8: fileId.slice(0, 8),
        from: previousStatus,
        to: status,
        label,
        fileState: readMindMapTraceFileState(fileId),
      });
    }
    previousStatusRef.current = status;
    devDebug("mindmap-persist", "[DEBUG] useFileDraftStatus", {
      fileId8: fileId.slice(0, 8),
      status,
      label,
      baselineHash8: FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
      draftHash8: FileSyncState.getDraftHash(fileId)?.slice(0, 8) ?? null,
      syncState: FileSyncState.getSyncState(fileId),
    });
  }, [fileId, label, status]);

  return {
    status,
    unsaved: status === "draft",
    label,
  };
}
