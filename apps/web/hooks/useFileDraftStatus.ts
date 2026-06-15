import { useEffect, useState } from "react";

import {
  readStoredFileModificationState,
  type FileModificationDraftStatus,
} from "../data/fileModificationState";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { LocalDraftSessions } from "../data/localDraftSessions";

/** 与历史面板「本地草稿」徽章文案一致 */
export const FILE_DRAFT_STATUS_LABEL = {
  draft: "未保存",
  synced: "无修改",
} as const;

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
): string | null {
  if (status === "idle") {
    return null;
  }
  return FILE_DRAFT_STATUS_LABEL[status];
}

/**
 * 订阅 excalidraw-file-sync-state，与 ArchivePanel 本地草稿徽章使用同一判定逻辑。
 */
export function useFileDraftStatus(fileId: string | null) {
  const [, syncRevision] = useState(0);

  useEffect(() => {
    const bump = () => syncRevision((revision) => revision + 1);
    window.addEventListener("excalidraw-file-sync-state", bump);
    return () =>
      window.removeEventListener("excalidraw-file-sync-state", bump);
  }, []);

  const status = readFileDraftStatus(fileId);
  const label = getFileDraftStatusLabel(status);

  return {
    status,
    unsaved: status === "draft",
    label,
  };
}
