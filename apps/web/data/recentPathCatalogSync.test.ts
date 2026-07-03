import { describe, expect, it, vi, afterEach } from "vitest";

import {
  fingerprintRecentAbsPaths,
  findCatalogFileByAbsPath,
  mergeCatalogFileForRecentDisplay,
  mergeRecentPathCatalogBatch,
  mergeRecentPathCatalogFromTree,
  patchRecentPathCatalogFileMetadata,
} from "./recentPathCatalogSync";
import * as recentFiles from "./recentFiles";
import type { ServerFile } from "./ServerSync";

describe("recentPathCatalogSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fingerprints paths case-insensitively regardless of order", () => {
    expect(fingerprintRecentAbsPaths(["C:/B.smm", "C:/a.smm"])).toBe(
      fingerprintRecentAbsPaths(["c:\\a.smm", "c:\\b.smm"]),
    );
  });

  it("preserves has_thumbnail from tree or previous resolve", () => {
    const resolved = {
      id: "file-1",
      name: "a",
      kind: "excalidraw",
      has_thumbnail: false,
      content_sha256: "sha-1",
    } as ServerFile;
    const merged = mergeCatalogFileForRecentDisplay(resolved, {
      fromTree: {
        ...resolved,
        has_thumbnail: true,
      },
    });
    expect(merged.has_thumbnail).toBe(true);
  });

  it("findCatalogFileByAbsPath matches path registry on tree files", () => {
    vi.spyOn(recentFiles, "getRecentPathForFileId").mockImplementation((fileId) =>
      fileId === "file-1" ? "C:/data/demo.smm" : null,
    );
    const filesById = new Map<string, ServerFile>([
      [
        "file-1",
        { id: "file-1", name: "demo", kind: "mindmap" } as ServerFile,
      ],
    ]);
    expect(findCatalogFileByAbsPath("c:\\data\\demo.smm", filesById)?.id).toBe(
      "file-1",
    );
  });

  it("takes the newer updated_at (and its sha/version) from tree over stale resolve", () => {
    const resolved = {
      id: "file-1",
      name: "旧名",
      kind: "mindmap",
      has_thumbnail: true,
      content_sha256: "sha-old",
      version: 3,
      updated_at: "2026-07-01T00:00:00.000Z",
    } as ServerFile;
    const merged = mergeCatalogFileForRecentDisplay(resolved, {
      fromTree: {
        ...resolved,
        name: "保存后",
        content_sha256: "sha-new",
        version: 4,
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    });
    expect(merged.updated_at).toBe("2026-07-02T00:00:00.000Z");
    expect(merged.content_sha256).toBe("sha-new");
    expect(merged.version).toBe(4);
    expect(merged.name).toBe("保存后");
  });

  it("mergeRecentPathCatalogFromTree propagates updated_at changes", () => {
    const stale = {
      id: "file-1",
      name: "a",
      kind: "mindmap",
      has_thumbnail: true,
      content_sha256: "sha-1",
      updated_at: "2026-07-01T00:00:00.000Z",
    } as ServerFile;
    const catalog = { "C:/a.smm": stale };
    const filesById = new Map<string, ServerFile>([
      ["file-1", { ...stale, updated_at: "2026-07-02T00:00:00.000Z" }],
    ]);
    const merged = mergeRecentPathCatalogFromTree(catalog, filesById);
    expect(merged).not.toBe(catalog);
    expect(merged["C:/a.smm"]?.updated_at).toBe("2026-07-02T00:00:00.000Z");
  });

  it("patchRecentPathCatalogFileMetadata updates entries by file id in place", () => {
    const entry = {
      id: "file-1",
      name: "a",
      kind: "mindmap",
      has_thumbnail: true,
      content_sha256: "sha-1",
      version: 1,
      updated_at: "2026-07-01T00:00:00.000Z",
    } as ServerFile;
    const catalog = {
      "C:/a.smm": entry,
      "C:/b.smm": { ...entry, id: "file-2" },
    };
    const patched = patchRecentPathCatalogFileMetadata(catalog, "file-1", {
      content_sha256: "sha-2",
      version: 2,
      updated_at: "2026-07-02T00:00:00.000Z",
    });
    expect(patched).not.toBe(catalog);
    expect(patched["C:/a.smm"]).toMatchObject({
      content_sha256: "sha-2",
      version: 2,
      updated_at: "2026-07-02T00:00:00.000Z",
    });
    expect(patched["C:/b.smm"]).toBe(catalog["C:/b.smm"]);

    const noop = patchRecentPathCatalogFileMetadata(patched, "file-1", {
      updated_at: "2026-07-02T00:00:00.000Z",
    });
    expect(noop).toBe(patched);
  });

  it("mergeRecentPathCatalogBatch keeps failed paths from previous catalog", () => {
    const prev = {
      "C:/old.smm": { id: "old", name: "old", kind: "mindmap" } as ServerFile,
    };
    const merged = mergeRecentPathCatalogBatch(
      prev,
      ["C:/new.smm"],
      {
        "C:/new.smm": {
          id: "new",
          name: "new",
          kind: "mindmap",
        } as ServerFile,
      },
      new Map(),
      { replaceScope: true },
    );
    expect(Object.keys(merged)).toEqual(["C:/new.smm"]);
    expect(merged["C:/new.smm"]?.id).toBe("new");
  });
});
