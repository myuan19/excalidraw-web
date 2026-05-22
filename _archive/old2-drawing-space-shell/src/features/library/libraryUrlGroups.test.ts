import { describe, expect, it } from "vitest";
import {
  autoCreateGroupFromUrlImport,
  deriveGroupNameFromLibraryUrl,
} from "./libraryUrlGroups";

describe("libraryUrlGroups", () => {
  it("derives group name from library url path", () => {
    const name = deriveGroupNameFromLibraryUrl(
      "https://libraries.excalidraw.com/libraries/BjoernKW/library.excalidrawlib",
    );
    expect(name).toBe("library");
  });

  it("creates a group for newly imported item ids", () => {
    const groups = autoCreateGroupFromUrlImport(
      [{ id: "g1", name: "Old", itemIds: ["a"] }],
      "https://example.com/foo.excalidrawlib",
      ["b", "c"],
    );
    expect(groups).toHaveLength(2);
    expect(groups[1].name).toBe("foo");
    expect(groups[1].itemIds).toEqual(["b", "c"]);
    expect(groups.at(0)?.itemIds).toEqual(["a"]);
  });
});
