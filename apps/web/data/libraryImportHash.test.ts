import { describe, expect, it } from "vitest";

import {
  normalizeFileHashAfterLibraryImport,
  parseLibraryImportTokensFromHash,
  sanitizeFileIdFromHashValue,
} from "./libraryImportHash";

describe("libraryImportHash", () => {
  const mangled =
    "#file=173d7294-5b5d-4760-b6d5-bddc0629f550%23addLibrary%3Dhttps%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Fyouritjang%2Fsoftware-architecture.excalidrawlib#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Fyouritjang%2Fsoftware-architecture.excalidrawlib&token=abc";

  it("parses addLibrary from mangled desktop deep-link hash", () => {
    const tokens = parseLibraryImportTokensFromHash(mangled);
    expect(tokens).not.toBeNull();
    expect(tokens?.libraryUrl).toContain("software-architecture.excalidrawlib");
    expect(tokens?.idToken).toBe("abc");
  });

  it("sanitizes file id embedded with encoded addLibrary", () => {
    expect(
      sanitizeFileIdFromHashValue(
        "173d7294-5b5d-4760-b6d5-bddc0629f550#addLibrary=https://example.com/x.excalidrawlib",
      ),
    ).toBe("173d7294-5b5d-4760-b6d5-bddc0629f550");
  });

  it("normalizes mangled hash back to file route", () => {
    expect(normalizeFileHashAfterLibraryImport(mangled)).toBe(
      "#file=173d7294-5b5d-4760-b6d5-bddc0629f550",
    );
  });
});
