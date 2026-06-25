import { afterEach, describe, expect, it } from "vitest";

import {
  patchFileListTreeCacheSavedFile,
  patchFileListTreeCacheThumbnailMissing,
  readFileListTreeCache,
  writeFileListTreeCache,
} from "./fileListSessionCache";
import type { ServerFile } from "./ServerSync";

function mockFile(overrides: Partial<ServerFile>): ServerFile {
  return {
    id: "file-1",
    name: "测试",
    kind: "excalidraw",
    has_thumbnail: true,
    content_sha256: "sha-1",
    folder_id: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as ServerFile;
}

describe("fileListSessionCache", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("marks cached thumbnail as missing for the same content hash", () => {
    writeFileListTreeCache({
      folders: [],
      files: [mockFile({ id: "file-1", content_sha256: "sha-1" })],
    });

    expect(patchFileListTreeCacheThumbnailMissing("file-1", "sha-1")).toBe(
      true,
    );
    expect(readFileListTreeCache()?.files[0].has_thumbnail).toBe(false);
  });

  it("keeps cached thumbnail flag when content hash changed", () => {
    writeFileListTreeCache({
      folders: [],
      files: [mockFile({ id: "file-1", content_sha256: "sha-new" })],
    });

    expect(patchFileListTreeCacheThumbnailMissing("file-1", "sha-old")).toBe(
      false,
    );
    expect(readFileListTreeCache()?.files[0].has_thumbnail).toBe(true);
  });

  it("patches saved file metadata after a successful save", () => {
    writeFileListTreeCache({
      folders: [],
      files: [
        mockFile({
          id: "file-1",
          name: "旧名",
          content_sha256: "sha-old",
          version: 1,
          has_thumbnail: false,
        }),
      ],
    });

    expect(
      patchFileListTreeCacheSavedFile("file-1", {
        name: "新名",
        kind: "mindmap",
        has_thumbnail: true,
        content_sha256: "sha-new",
        version: 2,
        updated_at: "2026-06-22T00:00:00.000Z",
      }),
    ).toBe(true);

    expect(readFileListTreeCache()?.files[0]).toMatchObject({
      id: "file-1",
      name: "新名",
      kind: "mindmap",
      has_thumbnail: true,
      content_sha256: "sha-new",
      version: 2,
      updated_at: "2026-06-22T00:00:00.000Z",
    });
    expect(sessionStorage.getItem("excalidraw-filelist-tree-etag-v1")).toBeNull();
  });
});
