import { describe, expect, it } from "vitest";

import {
  hashNeedsEditorRoute,
  isLegacyTempFileId,
  isNewDocumentHash,
} from "./documentHash";

describe("documentHash", () => {
  it("detects new-document routes", () => {
    expect(isNewDocumentHash("#new=1")).toBe(true);
    expect(isNewDocumentHash("#new=1&kind=mindmap")).toBe(true);
    expect(isNewDocumentHash("#file=abc")).toBe(false);
  });

  it("treats new-document and file routes as editor routes", () => {
    expect(hashNeedsEditorRoute("#new=1")).toBe(true);
    expect(hashNeedsEditorRoute("#file=abc")).toBe(true);
    expect(hashNeedsEditorRoute("#addLibrary=foo")).toBe(true);
    expect(hashNeedsEditorRoute("")).toBe(false);
  });

  it("flags legacy temp ids", () => {
    expect(isLegacyTempFileId("local-temp:abc")).toBe(true);
    expect(isLegacyTempFileId("server-id")).toBe(false);
  });
});
