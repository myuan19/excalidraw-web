import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitLibraryItemsByScope, toLibraryItem, type EditorLibraryItem } from "./combinedLibraryAdapter";
import { readLibraryMirror, writeLibraryMirror } from "./librarySyncQueue";
import type { LibraryItem } from "@/types/file";

describe("combinedLibraryAdapter", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  it("converts server library rows to editor library items", () => {
    const item = toLibraryItem({
      id: "a",
      scope: "public",
      file_id: null,
      name: "Public",
      data: [{ type: "rectangle" }],
      created_at: "2026-05-20T00:00:00.000Z",
      sort_index: 0,
    });

    expect(item).toMatchObject({
      id: "a",
      name: "Public",
      scope: "public",
      status: "published",
    });
    expect(item.elements).toHaveLength(1);
  });

  it("splits editor library items into public personal and canvas payloads", () => {
    const items: EditorLibraryItem[] = [
      { id: "public", name: "P", scope: "public", elements: [], created: 1 },
      { id: "canvas", name: "C", scope: "canvas", elements: [], created: 2 },
      { id: "personal", name: "U", elements: [], created: 3 },
    ];

    const result = splitLibraryItemsByScope(items, "file-a");

    expect((result.publicItems as LibraryItem[]).map((item) => item.id)).toEqual(["public"]);
    expect((result.canvasItems as LibraryItem[]).map((item) => item.id)).toEqual(["canvas"]);
    expect((result.personalItems as LibraryItem[]).map((item) => item.id)).toEqual(["personal"]);
    expect(result.fileId).toBe("file-a");
  });

  it("includes library groups in sync payloads", () => {
    const result = splitLibraryItemsByScope([], "file-a", [
      { id: "group-a", name: "Group", itemIds: ["item-a"], collapsed: true },
    ]);

    expect(result.groups).toEqual([
      { id: "group-a", name: "Group", itemIds: ["item-a"], collapsed: true },
    ]);
  });

  it("can read a previously written local library mirror", () => {
    writeLibraryMirror({ libraryItems: [{ id: "local", elements: [] }] });

    expect(readLibraryMirror()).toEqual({
      libraryItems: [{ id: "local", elements: [] }],
    });
  });
});
