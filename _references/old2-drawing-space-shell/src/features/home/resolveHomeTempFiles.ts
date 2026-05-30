import { editorRegistry } from "@/features/editor/EditorRegistry";
import { listTempFilesAsServerFiles } from "@/features/tempFiles/listTempFiles";
import { listHomeEditors } from "@/features/home/listHomeEditors";
import type { ServerFile } from "@/types/file";

/** 每种编辑器类型最多一条临时记录（与已注册编辑器数量上限一致） */
export function resolveHomeTempFiles(): ServerFile[] {
  const temps = listTempFilesAsServerFiles();
  const byKind = new Map<string, ServerFile>();
  for (const file of temps) {
    if (!byKind.has(file.kind)) {
      byKind.set(file.kind, file);
    }
  }

  const orderedKinds: string[] = [];
  const seen = new Set<string>();
  for (const entry of listHomeEditors()) {
    if (!seen.has(entry.fileKind)) {
      orderedKinds.push(entry.fileKind);
      seen.add(entry.fileKind);
    }
  }
  for (const meta of editorRegistry.listAll()) {
    const kind = meta.fileKind ?? meta.id;
    if (!seen.has(kind)) {
      orderedKinds.push(kind);
      seen.add(kind);
    }
  }

  if (orderedKinds.length === 0) {
    return [...byKind.values()];
  }

  return orderedKinds
    .map((kind) => byKind.get(kind))
    .filter((file): file is ServerFile => !!file);
}
