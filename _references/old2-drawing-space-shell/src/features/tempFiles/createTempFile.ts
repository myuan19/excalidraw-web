import { getDocumentAdapter } from "@/features/documents";
import { recordRecentFile } from "@/features/home/recentFiles";
import { LocalDraftStorage } from "@/features/sync";
import type { ServerFile } from "@/types/file";
import { createLocalTempFileId } from "./tempFileId";
import { removeTempsForKind } from "./removeTempsForKind";
import { TempFileStorage, tempRecordToServerFile } from "./TempFileStorage";

function buildEmptyDataText(kind: string): string {
  const adapter = getDocumentAdapter(kind);
  if (!adapter) {
    return JSON.stringify({});
  }
  const empty = adapter.createEmpty();
  return JSON.stringify(empty);
}

export async function createTempFile(
  kind: string,
  name = "未命名",
): Promise<ServerFile> {
  removeTempsForKind(kind);

  const now = new Date().toISOString();
  const id = createLocalTempFileId();
  const trimmedName = name.trim() || "未命名";
  const record = {
    id,
    name: trimmedName,
    kind,
    created_at: now,
    updated_at: now,
  };
  TempFileStorage.upsert(record);
  const dataText = buildEmptyDataText(kind);
  LocalDraftStorage.set(id, dataText, `temp:${now}`);
  recordRecentFile(id);
  return tempRecordToServerFile(record);
}
