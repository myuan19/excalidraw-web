import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerSync } from "./ServerSync";
import { getRecentFileEntries, RECENT_FILES_KEY } from "./recentFiles";
import {
  fileAwaitingNativeThumbnail,
  trackCatalogPathsToRecent,
} from "./trackCatalogPathsToRecent";

import type { ServerFile } from "./ServerSync";

vi.mock("./ServerSync", () => ({
  ServerSync: {
    resolveCatalogFileByPath: vi.fn(),
    trackCatalogFileByPath: vi.fn(),
  },
  ServerSyncError: class ServerSyncError extends Error {
    status: number;
    body: string;
    constructor(message: string, status: number, _path: string, body: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  getServerSyncErrorJson: vi.fn((error: unknown) => {
    if (error instanceof Error && "body" in error) {
      try {
        return JSON.parse(String((error as { body: string }).body));
      } catch {
        return null;
      }
    }
    return null;
  }),
}));

describe("trackCatalogPathsToRecent", () => {
  afterEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
    vi.clearAllMocks();
  });

  it("returns tracked files in input order", async () => {
    vi.mocked(ServerSync.resolveCatalogFileByPath)
      .mockResolvedValueOnce({
        absPath: "C:/a.smm",
        file: { id: "file-a", name: "a", kind: "mindmap" } as ServerFile,
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          body: JSON.stringify({ code: "not_in_catalog" }),
        }),
      );
    vi.mocked(ServerSync.trackCatalogFileByPath).mockResolvedValueOnce({
      absPath: "C:/b.smm",
      tracked: true,
      file: { id: "file-b", name: "b", kind: "mindmap" } as ServerFile,
    });

    const result = await trackCatalogPathsToRecent(["C:/a.smm", "C:/b.smm", ""]);

    expect(result.tracked).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.trackedFilesInOrder.map((file) => file.id)).toEqual([
      "file-a",
      "file-b",
    ]);
    expect(getRecentFileEntries()).toHaveLength(0);
  });
});

describe("fileAwaitingNativeThumbnail", () => {
  it("detects editor files that have no content-bound local thumbnail", () => {
    const file = {
      id: "file-1",
      kind: "mindmap",
      content_sha256: "sha-1",
    } as ServerFile;

    expect(fileAwaitingNativeThumbnail(file)).toBe(true);
  });
});
