import { editorRegistry } from "@/features/editor/EditorRegistry";

export interface HomeEditorEntry {
  id: string;
  fileKind: string;
  label: string;
  tagline: string;
  icon: string;
}

export function listHomeEditors(): HomeEditorEntry[] {
  return editorRegistry
    .listAll()
    .filter((meta) => meta.showOnHome !== false)
    .sort((a, b) => (a.homeOrder ?? 99) - (b.homeOrder ?? 99))
    .map((meta) => ({
      id: meta.id,
      fileKind: meta.fileKind ?? meta.id,
      label: meta.homeLabel ?? meta.displayName,
      tagline: meta.homeTagline ?? "",
      icon: meta.icon,
    }));
}

/** 将编辑器名称格式化为「A、B与C」 */
export function formatEditorNameList(labels: string[]): string {
  if (labels.length === 0) return "";
  const first = labels.at(0);
  const second = labels.at(1);
  const last = labels.at(-1);
  if (labels.length === 1 && first) return first;
  if (labels.length === 2 && first && second) return `${first}与${second}`;
  if (!last) return "";
  return `${labels.slice(0, -1).join("、")}与${last}`;
}
