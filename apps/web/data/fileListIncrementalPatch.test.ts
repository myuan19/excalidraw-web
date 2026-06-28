import { beforeEach, describe, expect, it } from "vitest";

import {
  mergeFileListTreeWithSessionCachePatches,
  resolveListSortUpdatedAt,
} from "./fileListIncrementalPatch";
import { writeFileListTreeCache } from "./fileListSessionCache";
import type { FileTreeResponse, ServerFile } from "./ServerSync";

function makeFile(overrides: Partial<ServerFile> = {}): ServerFile {
  return {
    id: "file-1",
    name: "Test",
    kind: "excalidraw",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    folder_id: null,
    sort_index: 0,
    has_thumbnail: false,
    content_sha256: "old-sha",
    version: 1,
    archive_count: 0,
    origin: "managed",
    importable: false,
    health: "ok",
    parse_error: null,
    corrupt: false,
    ...overrides,
  };
}

describe("fileListIncrementalPatch", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("resolveListSortUpdatedAt prefers local edit and session patch timestamps", () => {
    writeFileListTreeCache({
      folders: [],
      files: [
        makeFile({
          updated_at: "2026-06-28T12:34:31.413Z",
          content_sha256: "new-sha",
          version: 2,
        }),
      ],
    });

    expect(
      resolveListSortUpdatedAt(
        "file-1",
        "2026-06-01T12:00:00.000Z",
        "2026-06-28T12:34:00.000Z",
      ),
    ).toBe("2026-06-28T12:34:31.413Z");

    sessionStorage.clear();
    expect(
      resolveListSortUpdatedAt(
        "file-1",
        "2026-06-01T12:00:00.000Z",
        "2026-06-28T12:34:00.000Z",
      ),
    ).toBe("2026-06-28T12:34:00.000Z");

    writeFileListTreeCache({
      folders: [],
      files: [
        makeFile({
          updated_at: "2026-06-28T12:34:31.413Z",
          content_sha256: "new-sha",
          version: 2,
        }),
      ],
    });
    expect(
      resolveListSortUpdatedAt("file-1", "2026-06-01T12:00:00.000Z", null),
    ).toBe("2026-06-28T12:34:31.413Z");
  });

  it("mergeFileListTreeWithSessionCachePatches keeps newer session updated_at", () => {
    writeFileListTreeCache({
      folders: [],
      files: [
        makeFile({
          updated_at: "2026-06-28T12:34:31.413Z",
          content_sha256: "new-sha",
          version: 2,
        }),
      ],
    });
    const tree: FileTreeResponse = {
      folders: [],
      files: [
        makeFile({
          updated_at: "2026-06-01T12:00:00.000Z",
          content_sha256: "old-sha",
          version: 1,
        }),
      ],
    };
    const merged = mergeFileListTreeWithSessionCachePatches(tree);
    expect(merged.files[0].updated_at).toBe("2026-06-28T12:34:31.413Z");
  });
});
