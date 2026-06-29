import { describe, expect, it } from "vitest";

import {
  editorHubHashFromUrl,
  editorHubUrlsShareAppDocument,
  normalizeEditorHubDeepLink,
  normalizeLibraryImportDeepLinkHash,
  parseEditorHubDeepLinkFromArgv,
  parseLibraryImportTokensFromHashString,
} from "./parseEditorHubDeepLink.mjs";

describe("parseEditorHubDeepLink", () => {
  it("normalizes addLibrary deep links", () => {
    const url =
      "editorhub://app/index.html#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Ftest.excalidrawlib&token=abc";
    expect(normalizeEditorHubDeepLink(url)).toBe(url);
  });

  it("parses argv on Windows protocol launch", () => {
    const url =
      "editorhub://app/index.html#addLibrary=foo&token=bar";
    expect(
      parseEditorHubDeepLinkFromArgv([
        "EditorHub.exe",
        url,
      ]),
    ).toBe(url);
  });

  it("detects same-document hash navigation", () => {
    expect(
      editorHubUrlsShareAppDocument(
        "editorhub://app/index.html#file=a",
        "editorhub://app/index.html#addLibrary=x",
      ),
    ).toBe(true);
    expect(
      editorHubHashFromUrl(
        "editorhub://app/index.html#addLibrary=x&token=y",
      ),
    ).toBe("#addLibrary=x&token=y");
  });

  it("normalizes mangled library-install deep links", () => {
    const mangled =
      "#file=173d7294-5b5d-4760-b6d5-bddc0629f550%23addLibrary%3Dhttps%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Ftest.excalidrawlib#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Ftest.excalidrawlib&token=abc";
    const { navigationHash, tokens } =
      normalizeLibraryImportDeepLinkHash(mangled);
    expect(navigationHash).toBe(
      "#file=173d7294-5b5d-4760-b6d5-bddc0629f550",
    );
    expect(tokens?.libraryUrl).toContain("test.excalidrawlib");
    expect(tokens?.idToken).toBe("abc");
    expect(parseLibraryImportTokensFromHashString(mangled)).toEqual(tokens);
  });
});
