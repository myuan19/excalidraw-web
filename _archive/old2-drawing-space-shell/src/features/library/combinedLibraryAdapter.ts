import { ServerSync } from "@/services/ServerSync";
import type { LibraryGroup, LibraryItem, LibrarySyncPayload } from "@/types/file";
import { queueLibrarySync, readLibraryMirror } from "./librarySyncQueue";

export type LibraryScope = "public" | "personal" | "canvas";

export interface EditorLibraryItem {
  id: string;
  name?: string;
  elements: unknown[];
  created?: number;
  status?: "published" | "unpublished";
  scope?: LibraryScope;
}

export interface EditorLibraryData {
  libraryItems: EditorLibraryItem[];
  groups?: LibraryGroup[];
}

export function toLibraryScope(value: string | undefined): LibraryScope {
  return value === "public" || value === "canvas" || value === "personal" ? value : "personal";
}

export function toLibraryItem(item: LibraryItem): EditorLibraryItem {
  const scope = toLibraryScope(item.scope);
  return {
    id: item.id,
    name: item.name || undefined,
    elements: Array.isArray(item.data) ? item.data : [],
    created: new Date(item.created_at).getTime(),
    status: scope === "public" ? "published" : "unpublished",
    scope,
  };
}

export function splitLibraryItemsByScope(
  items: readonly EditorLibraryItem[],
  fileId: string | null,
  groups: LibraryGroup[] = [],
): LibrarySyncPayload {
  const publicItems: LibraryItem[] = [];
  const personalItems: LibraryItem[] = [];
  const canvasItems: LibraryItem[] = [];

  items.forEach((item, index) => {
    const scope = item.scope ?? (item.status === "published" ? "public" : "personal");
    const payload = {
      id: item.id,
      scope,
      file_id: scope === "canvas" ? fileId : null,
      name: item.name ?? "",
      data: item.elements,
      created_at: new Date(item.created ?? Date.now()).toISOString(),
      sort_index: index,
    } satisfies LibraryItem;

    if (scope === "public") publicItems.push(payload);
    else if (scope === "canvas") canvasItems.push(payload);
    else personalItems.push(payload);
  });

  return {
    publicItems,
    personalItems,
    canvasItems,
    fileId: fileId ?? undefined,
    groups,
  };
}

let currentFileId: string | null = null;
let cachedGroups: LibraryGroup[] = [];

export function setCombinedLibraryFileId(fileId: string | null) {
  currentFileId = fileId;
}

export const CombinedLibraryAdapter = {
  async load(): Promise<EditorLibraryData> {
    const [publicResult, personalResult, canvasResult, groupResult] = await Promise.allSettled([
      ServerSync.listPublicLibraryItems(),
      ServerSync.listPersonalLibraryItems(),
      currentFileId ? ServerSync.listCanvasLibraryItems(currentFileId) : Promise.resolve([]),
      ServerSync.listLibraryGroups(),
    ]);
    const hasFailure = [publicResult, personalResult, canvasResult].some((result) => result.status === "rejected");
    if (hasFailure) {
      const mirror = readLibraryMirror<EditorLibraryData>();
      if (mirror?.libraryItems?.length) return mirror;
    }
    const publicItems = publicResult.status === "fulfilled" ? publicResult.value : [];
    const personalItems = personalResult.status === "fulfilled" ? personalResult.value : [];
    const canvasItems = canvasResult.status === "fulfilled" ? canvasResult.value : [];
    const groups = groupResult.status === "fulfilled" ? groupResult.value : [];
    cachedGroups = groups;

    return {
      libraryItems: [
        ...canvasItems.map(toLibraryItem),
        ...personalItems.map(toLibraryItem),
        ...publicItems.map(toLibraryItem),
      ],
      groups,
    };
  },

  async save(data: EditorLibraryData): Promise<void> {
    const groups = data.groups ?? cachedGroups;
    cachedGroups = groups;
    await queueLibrarySync(
      { libraryItems: data.libraryItems, groups },
      splitLibraryItemsByScope(data.libraryItems, currentFileId, groups),
    );
  },
};
