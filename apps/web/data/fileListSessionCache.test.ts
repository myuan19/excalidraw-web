import { afterEach, describe, expect, it } from "vitest";

import { mergeFileListTreeWithSessionCachePatches } from "./fileListIncrementalPatch";
import {
  patchFileListTreeCacheSavedFile,
  patchFileListTreeCacheThumbnailMissing,
  readFileListTreeCache,
  readFileListTreeCacheEtag,
  writeFileListTreeCache,
  writeFileListTreeCacheEtag,
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

  it("does not mirror the tree to localStorage on web", () => {
    writeFileListTreeCache({
      folders: [],
      files: [mockFile({ id: "file-1" })],
    });

    expect(
      localStorage.getItem("excalidraw-filelist-tree-persist-v1"),
    ).toBeNull();
  });

  it("prefers newer session-cache metadata when merging catalog trees", () => {
    writeFileListTreeCache({
      folders: [],
      files: [
        mockFile({
          id: "file-1",
          content_sha256: "sha-new",
          version: 2,
          has_thumbnail: true,
          updated_at: "2026-06-22T00:01:00.000Z",
        }),
      ],
    });

    const merged = mergeFileListTreeWithSessionCachePatches({
      folders: [],
      files: [
        mockFile({
          id: "file-1",
          content_sha256: "sha-old",
          version: 1,
          has_thumbnail: false,
          updated_at: "2026-06-22T00:00:00.000Z",
        }),
      ],
    });

    expect(merged.files[0]).toMatchObject({
      content_sha256: "sha-new",
      version: 2,
      has_thumbnail: true,
      updated_at: "2026-06-22T00:01:00.000Z",
    });
  });
});

describe("fileListSessionCache desktop persist mirror", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
  });

  it("seeds the session cache from localStorage after a cold start", () => {
    window.editorHubDesktop = { platform: "win32" };
    writeFileListTreeCache({
      folders: [],
      files: [mockFile({ id: "file-1", name: "持久化" })],
    });
    writeFileListTreeCacheEtag('W/"tree-1"');

    // 模拟重启：session 层清空，localStorage 镜像仍在
    sessionStorage.clear();

    const tree = readFileListTreeCache();
    expect(tree?.files[0]).toMatchObject({ id: "file-1", name: "持久化" });
    // etag 随树一起回填，首个 GET /tree 可命中 304
    expect(readFileListTreeCacheEtag()).toBe('W/"tree-1"');
  });

  it("never returns a persisted etag without a usable cached tree", () => {
    window.editorHubDesktop = { platform: "win32" };
    // 只有孤儿 etag，没有镜像树（如镜像写入曾因配额失败）
    localStorage.setItem(
      "excalidraw-filelist-tree-persist-etag-v1",
      'W/"orphan"',
    );

    expect(readFileListTreeCacheEtag()).toBeNull();
  });

  it("clears the mirrored etag when local mutations invalidate it", () => {
    window.editorHubDesktop = { platform: "win32" };
    writeFileListTreeCache({
      folders: [],
      files: [mockFile({ id: "file-1" })],
    });
    writeFileListTreeCacheEtag('W/"tree-1"');

    patchFileListTreeCacheSavedFile("file-1", { name: "改名" });

    expect(
      localStorage.getItem("excalidraw-filelist-tree-persist-etag-v1"),
    ).toBeNull();
    // 镜像树保持最新（patch 后的树也已镜像）
    sessionStorage.clear();
    expect(readFileListTreeCache()?.files[0]).toMatchObject({ name: "改名" });
    expect(readFileListTreeCacheEtag()).toBeNull();
  });

  it("drops a corrupt mirror instead of seeding from it", () => {
    window.editorHubDesktop = { platform: "win32" };
    localStorage.setItem("excalidraw-filelist-tree-persist-v1", "{corrupt");
    localStorage.setItem(
      "excalidraw-filelist-tree-persist-etag-v1",
      'W/"stale"',
    );

    expect(readFileListTreeCache()).toBeNull();
    expect(
      localStorage.getItem("excalidraw-filelist-tree-persist-v1"),
    ).toBeNull();
    expect(
      localStorage.getItem("excalidraw-filelist-tree-persist-etag-v1"),
    ).toBeNull();
  });
});
