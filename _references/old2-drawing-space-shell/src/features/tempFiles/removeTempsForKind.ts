import { LocalThumbnailCache } from "@/features/thumbnail";
import { FileSyncState, LocalDraftStorage } from "@/features/sync";
import { TempFileStorage } from "./TempFileStorage";

/** 同一编辑器类型仅保留一个临时文件；创建新临时文件前调用 */
export function removeTempsForKind(kind: string, exceptId?: string): void {
  for (const record of TempFileStorage.list()) {
    if (record.kind !== kind || record.id === exceptId) continue;
    TempFileStorage.remove(record.id);
    LocalDraftStorage.remove(record.id);
    LocalThumbnailCache.clear(record.id);
    FileSyncState.remove(record.id);
  }
}
