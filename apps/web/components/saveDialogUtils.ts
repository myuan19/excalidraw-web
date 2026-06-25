import { editorRegistry } from "../editors";
import type { ServerFile } from "../data/ServerSync";

export function saveExtensionForKind(kind: string): string {
  const plugin = editorRegistry.getByKind(kind);
  const ext = plugin?.adapter.extensions[0];
  return ext ?? ".excalidraw";
}

export function normalizeSaveBaseName(name: string, extension: string): string {
  const trimmed = name.trim() || "未命名";
  const lower = trimmed.toLowerCase();
  const extLower = extension.toLowerCase();
  if (lower.endsWith(extLower)) {
    return trimmed.slice(0, trimmed.length - extension.length).trim() || "未命名";
  }
  return trimmed;
}

function saveNameKey(name: string, extension: string): string {
  return normalizeSaveBaseName(name, extension).toLocaleLowerCase();
}

export function hasSaveNameConflict({
  files,
  folderId,
  documentKind,
  name,
}: {
  files: ServerFile[];
  folderId: string | null;
  documentKind: string;
  name: string;
}): boolean {
  if (!folderId) {
    return false;
  }
  const extension = saveExtensionForKind(documentKind);
  const targetName = saveNameKey(name, extension);
  const targetKind = editorRegistry.resolveKind(documentKind);
  return files.some((file) => {
    if ((file.folder_id ?? null) !== folderId) {
      return false;
    }
    if (editorRegistry.resolveKind(file.kind) !== targetKind) {
      return false;
    }
    return saveNameKey(file.name, extension) === targetName;
  });
}

export type DiskFolderPickResult = {
  folderId: string;
  absPath: string;
};
