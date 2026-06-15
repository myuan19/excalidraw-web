import { afterEach, describe, expect, it } from "vitest";

import {
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
});
