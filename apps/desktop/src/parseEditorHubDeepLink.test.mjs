import { describe, expect, it } from "vitest";

import {
  editorHubHashFromUrl,
  editorHubUrlsShareAppDocument,
  normalizeEditorHubDeepLink,
  parseEditorHubDeepLinkFromArgv,
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
});
