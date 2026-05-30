import type { LibraryGroup } from "@/types/file";

export function deriveGroupNameFromLibraryUrl(libraryUrl: string): string {
  try {
    const u = new URL(libraryUrl);
    let base = u.pathname.split("/").filter(Boolean).pop() ?? "";
    base = base.replace(/\.excalidrawlib$/i, "");
    try {
      base = decodeURIComponent(base);
    } catch {
      // keep base
    }
    if (base) return base;
    return u.hostname.replace(/^www\./i, "") || "Library";
  } catch {
    return "Library";
  }
}

export function autoCreateGroupFromUrlImport(
  groups: LibraryGroup[],
  libraryUrl: string,
  addedItemIds: string[],
): LibraryGroup[] {
  if (!addedItemIds.length) return groups;
  const name = deriveGroupNameFromLibraryUrl(libraryUrl);
  const filtered = addedItemIds.filter((id) => typeof id === "string" && id);
  const cleaned = groups.map((group) => ({
    ...group,
    itemIds: group.itemIds.filter((id) => !filtered.includes(id)),
  }));
  cleaned.push({
    id: crypto.randomUUID(),
    name,
    itemIds: filtered,
  });
  return cleaned;
}
