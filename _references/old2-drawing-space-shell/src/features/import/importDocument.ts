import { ServerSync } from "@/services/ServerSync";
import { createImportThumbnail } from "./importThumbnail";
import {
  getDocumentAdapterForFile,
  type DocumentFormatAdapter,
} from "@/features/documents";

import type { ServerFile } from "@/types/file";

function stripExtension(name: string): string {
  return name.replace(/\.(excalidraw|json|smm|png|svg|txt|md)$/i, "") || name;
}

function requireAdapter(file: File): DocumentFormatAdapter {
  if (/\.excalidrawlib$/i.test(file.name)) {
    throw new Error("素材库文件请在 Excalidraw 素材库中导入，不能作为绘图文件导入。");
  }
  const adapter = getDocumentAdapterForFile(file);
  if (!adapter) {
    throw new Error(`暂不支持导入 ${file.name}`);
  }
  return adapter;
}

export async function importDocumentFile(
  file: File,
  folderId: string | null,
): Promise<ServerFile> {
  const adapter = requireAdapter(file);
  const name = stripExtension(file.name);
  const created = await ServerSync.createFile(name, adapter.kind, folderId);
  try {
    const parsed = await adapter.parse(file);
    const document = adapter.toDocument(parsed as never);
    const thumbnail = await createImportThumbnail(adapter.kind, name, document);
    await ServerSync.saveFileImmediate(created.id, document, name, thumbnail);
    return { ...created, name, kind: adapter.kind, has_thumbnail: true };
  } catch (error) {
    await ServerSync.deleteFile(created.id).catch(() => undefined);
    throw error;
  }
}
