import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getActiveDocumentFileId,
  resolveRecentFlyoutItems,
} from "./recentFlyoutItems";
import {
  getRecentFileEntries,
  recordRecentFileAccess,
  RECENT_FILES_KEY,
} from "./recentFiles";
import { readFileListTreeCache } from "./fileListSessionCache";

vi.mock("./fileIdFromHash", () => ({
  getFileIdFromHash: vi.fn(() => "current-doc"),
}));

vi.mock("./fileListSessionCache", () => ({
  readFileListTreeCache: vi.fn(),
}));

describe("resolveRecentFlyoutItems", () => {
  beforeEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
    vi.mocked(readFileListTreeCache).mockReturnValue({
      files: [
        {
          id: "current-doc",
          name: "当前文档",
          kind: "excalidraw",
          has_thumbnail: true,
          content_sha256: "aa",
        } as never,
        {
          id: "other-doc",
          name: "其它",
          kind: "excalidraw",
          has_thumbnail: true,
          content_sha256: "bb",
        } as never,
      ],
      folders: [],
    });
    recordRecentFileAccess("current-doc");
    recordRecentFileAccess("other-doc");
  });

  afterEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
  });

  it("excludes the document currently open in the editor", () => {
    const ids = resolveRecentFlyoutItems({
      excludeFileId: "current-doc",
    }).map((item) => item.id);
    expect(ids).not.toContain("current-doc");
    expect(ids).toContain("other-doc");
  });

  it("returns fewer than six when other files are insufficient", () => {
    const ids = resolveRecentFlyoutItems({
      limit: 6,
      excludeFileId: "current-doc",
    }).map((item) => item.id);
    expect(ids).toHaveLength(1);
    expect(ids).not.toContain("current-doc");
  });

  it("shows at most six other files when current is most recent", () => {
    const moreIds = ["doc-a", "doc-b", "doc-c", "doc-d", "doc-e", "doc-f", "doc-g"];
    for (const id of moreIds) {
      recordRecentFileAccess(id);
    }
    recordRecentFileAccess("current-doc");
    vi.mocked(readFileListTreeCache).mockReturnValue({
      files: [
        { id: "current-doc", name: "当前", kind: "excalidraw", has_thumbnail: false },
        ...moreIds.map((id) => ({
          id,
          name: id,
          kind: "excalidraw",
          has_thumbnail: false,
        })),
      ],
      folders: [],
    } as never);
    const ids = resolveRecentFlyoutItems({
      limit: 6,
      excludeFileId: "current-doc",
    }).map((item) => item.id);
    expect(ids).toHaveLength(6);
    expect(ids).not.toContain("current-doc");
  });

  it("reads active file id from hash helper", () => {
    expect(getActiveDocumentFileId()).toBe("current-doc");
    expect(getRecentFileEntries().map((e) => e.id)).toContain("current-doc");
  });
});
