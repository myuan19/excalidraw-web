import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { getLocalDraftDisplayName } from "./localDraftDisplayName";
import { LocalDraftSessions } from "./localDraftSessions";

describe("localDraftDisplayName", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses trimmed local draft session names", () => {
    LocalDraftSessions.upsert({
      id: "local-draft:name-1",
      name: "  草稿标题  ",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(getLocalDraftDisplayName("local-draft:name-1")).toBe("草稿标题");
  });

  it("falls back to the shared default document display name", () => {
    LocalDraftSessions.upsert({
      id: "local-draft:name-2",
      name: "   ",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(getLocalDraftDisplayName("local-draft:name-2")).toBe(
      DEFAULT_DOCUMENT_DISPLAY_NAME,
    );
  });
});
