import { getDocumentAdapter } from "@/features/documents";
import { ServerSync } from "@/services/ServerSync";
import type { ServerFile } from "@/types/file";

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "untitled";
}

function toDownloadBlob(payload: string | object): Blob {
  if (typeof payload === "string") {
    return new Blob([payload], { type: "text/plain;charset=utf-8" });
  }
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
}

export async function downloadDocument(file: ServerFile): Promise<void> {
  const loaded = await ServerSync.getFile(file.id);
  const adapter = getDocumentAdapter(file.kind);
  if (!adapter) {
    throw new Error(`暂不支持下载 ${file.kind} 文件`);
  }

  const migrated = adapter.migrate(loaded.data);
  const payload = await adapter.serialize(migrated as never);
  const extension = adapter.extensions.at(0) ?? ".json";
  const blob = toDownloadBlob(payload);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(file.name)}${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
