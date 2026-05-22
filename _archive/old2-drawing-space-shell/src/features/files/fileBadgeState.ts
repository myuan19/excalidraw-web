import { FileSyncState } from "@/features/sync/FileSyncState";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";

export type FileBadge = "synced" | "draft" | "temp";

export function getFileBadge(fileId: string): FileBadge {
  if (isLocalTempFileId(fileId)) return "temp";
  if (FileSyncState.getSyncState(fileId) === "draft") return "draft";
  return "synced";
}

export function getFileBadgeLabel(badge: FileBadge): string | null {
  if (badge === "temp") return "临时";
  if (badge === "draft") return "未保存";
  return null;
}
