import { describe, expect, it } from "vitest";

import {
  createLibraryImportPlaceholderFile,
  resolveLibraryReturnUrl,
  stashLibraryUrlImportFromHash,
} from "./libraryUrlImport";

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

  it("stashes addLibrary tokens before hash restore", () => {
    expect(
      stashLibraryUrlImportFromHash(
        "#addLibrary=https%3A%2F%2Fexample.com%2Fa.excalidrawlib&token=t",
      ),
    ).toBe(true);
    expect(stashLibraryUrlImportFromHash("#file=abc")).toBe(false);
  });

  it("stashes addLibrary from mangled desktop deep-link hash", () => {
    const mangled =
      "#file=173d7294-5b5d-4760-b6d5-bddc0629f550%23addLibrary%3Dhttps%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Ftest.excalidrawlib#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Ftest.excalidrawlib&token=t";
    expect(stashLibraryUrlImportFromHash(mangled)).toBe(true);
  });
});
