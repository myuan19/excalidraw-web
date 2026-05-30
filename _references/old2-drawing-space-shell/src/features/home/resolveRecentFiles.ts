import { getRecentFileIds } from "@/features/home/recentFiles";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import type { ServerFile } from "@/types/file";

const MAX_RECENT = 12;

/** 最近打开：仅已落库的服务器文件，不含临时文件 */
export function resolveRecentFiles(serverFiles: ServerFile[]): ServerFile[] {
  const byId = new Map(serverFiles.map((file) => [file.id, file]));
  const resolved: ServerFile[] = [];

  for (const id of getRecentFileIds()) {
    if (isLocalTempFileId(id)) continue;
    const file = byId.get(id);
    if (file) resolved.push(file);
    if (resolved.length >= MAX_RECENT) break;
  }

  return resolved;
}
