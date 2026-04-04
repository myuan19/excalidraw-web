import { atom, editorJotaiStore } from "../editor-jotai";

export interface LibraryGroup {
  id: string;
  name: string;
  itemIds: string[];
}

export const libraryGroupsAtom = atom<LibraryGroup[]>([]);
export const libraryCollapsedAtom = atom<Record<string, boolean>>({});

export function setLibraryGroups(groups: LibraryGroup[]): void {
  editorJotaiStore.set(
    libraryGroupsAtom,
    groups.map((g) => ({ id: g.id, name: g.name, itemIds: [...g.itemIds] })),
  );
}

export function setLibraryCollapsed(
  collapsed: Record<string, boolean>,
): void {
  editorJotaiStore.set(libraryCollapsedAtom, { ...collapsed });
}
