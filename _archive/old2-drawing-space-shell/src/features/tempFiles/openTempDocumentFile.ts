import { recordRecentFile } from "@/features/home/recentFiles";
import { syncFileDeepLink } from "@/features/routing/fileDeepLink";
import { LocalDraftStorage } from "@/features/sync";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { useEditorStore } from "@/stores/editorStore";
import type { ServerFile } from "@/types/file";
import { isLocalTempFileId } from "./tempFileId";
import { TempFileStorage, tempRecordToServerFile } from "./TempFileStorage";

export async function openTempDocumentFile(file: ServerFile): Promise<void> {
  if (!isLocalTempFileId(file.id)) {
    throw new Error("不是本地临时文件");
  }

  const record = TempFileStorage.get(file.id);
  const draft = LocalDraftStorage.get(file.id);
  const dataText = draft?.data ?? "{}";
  const resolved: ServerFile = record
    ? { ...tempRecordToServerFile(record), name: file.name || record.name }
    : file;

  editorDebugLog("openTempDocumentFile", {
    fileId: file.id,
    kind: resolved.kind,
    hasRecord: !!record,
    hasDraft: !!draft,
    dataTextLength: dataText.length,
  });
  useEditorStore.getState().openFile(resolved, dataText);
  recordRecentFile(file.id);
  syncFileDeepLink(null);
  editorDebugLog("openTempDocumentFile.done", { fileId: file.id });
}
