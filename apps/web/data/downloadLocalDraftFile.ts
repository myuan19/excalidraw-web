import { editorRegistry } from "../editors";
import { normalizeDocument } from "./documentTypes";
import { getDocumentFormatAdapter } from "./formats/registry";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalDraftSessions } from "./localDraftSessions";

function triggerBrowserDownload(blob: Blob, downloadName: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/** 从浏览器本地缓存导出未保存的 local-draft 文件。 */
export async function downloadLocalDraftFile(
  id: string,
  fileName: string,
): Promise<void> {
  if (!isLocalDraftFileId(id)) {
    throw new Error("不是本地临时文件");
  }
  const meta = LocalDraftSessions.get(id);
  const kind = meta?.kind ?? "excalidraw";
  const cache = FileSyncState.getLocalCache(id);
  if (!cache) {
    throw new Error("没有可下载的本地内容");
  }

  const managedDocument = normalizeDocument(
    (cache as { document?: unknown }).document ?? cache,
  );
  const resolvedKind = managedDocument?.kind ?? kind;
  const adapter = getDocumentFormatAdapter(resolvedKind);
  const data =
    managedDocument && adapter
      ? await adapter.serialize(managedDocument.data)
      : (cache as { document?: unknown }).document ?? cache;

  const extension = editorRegistry.getDownloadExtension(resolvedKind);
  const blob = new Blob(
    [
      typeof data === "string"
        ? data
        : `${JSON.stringify(data, null, 2)}\n`,
    ],
    { type: "application/json" },
  );
  const baseName = (fileName || "document").replace(
    /\.(excalidraw|smm|txt|json)$/i,
    "",
  );
  triggerBrowserDownload(blob, `${baseName}.${extension}`);
}
