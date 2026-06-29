import { describe, expect, it } from "vitest";

import { createLibraryImportPlaceholderFile, resolveLibraryReturnUrl } from "./libraryUrlImport";

describe("libraryUrlImport", () => {
  it("creates an empty excalidraw placeholder for transient import sessions", () => {
    const file = createLibraryImportPlaceholderFile();
    expect(file.kind).toBe("excalidraw");
    expect(file.id).toBe("");
    expect(file.data).toBeTruthy();
  });

  it("builds library return url from current pathname", () => {
    expect(typeof resolveLibraryReturnUrl()).toBe("string");
  });
});
