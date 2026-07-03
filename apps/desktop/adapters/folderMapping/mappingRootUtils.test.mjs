import { describe, expect, it } from "vitest";

import {
  dedupeCatalogFiles,
  dedupeFoldersByPath,
  dedupeMappingRoots,
  mergePartialScanCheckpoint,
  mergeScanCheckpoint,
  normalizeMappingRootPlacement,
  pickFresherCatalogFile,
  reconcileScanMetaWithMappingRoots,
  repairMappingMeta,
} from "./mappingRootUtils.js";

describe("mappingRootUtils", () => {
  it("picks the fresher catalog file by version, then updated_at", () => {
    const older = {
      id: "f1",
      version: 13,
      updated_at: "2026-07-02T13:33:29.893Z",
      content_sha256: "old",
    };
    const newer = {
      id: "f1",
      version: 51,
      updated_at: "2026-07-02T14:04:18.270Z",
      content_sha256: "new",
    };
    expect(pickFresherCatalogFile(older, newer)).toBe(newer);
    expect(pickFresherCatalogFile(newer, older)).toBe(newer);
    expect(
      pickFresherCatalogFile(
        { ...older, version: 51 },
        newer,
      ),
    ).toBe(newer);
  });

  it("collapses duplicate file entries keeping the freshest (id then path)", () => {
    const fresh = {
      id: "f1",
      path: "C:/topics/a.smm",
      version: 51,
      updated_at: "2026-07-02T14:04:18.270Z",
      content_sha256: "fresh-sha",
    };
    const meta = {
      mapping_roots: [],
      folders: [],
      files: [
        fresh,
        {
          id: "f1",
          path: "C:/topics/a.smm",
          version: 12,
          updated_at: "2026-07-02T09:37:07.238Z",
          content_sha256: "stale-sha",
        },
        {
          id: "f1",
          path: "C:/topics/a.smm",
          version: 13,
          updated_at: "2026-07-02T13:33:29.893Z",
          content_sha256: "stale-sha-2",
        },
        { id: "f2", path: "C:/topics/b.smm", version: 1, updated_at: "2026-01-01" },
      ],
    };

    expect(dedupeCatalogFiles(meta)).toBe(true);
    expect(meta.files).toHaveLength(2);
    const f1 = meta.files.find((file) => file.id === "f1");
    expect(f1?.version).toBe(51);
    expect(f1?.content_sha256).toBe("fresh-sha");
    // 幂等：二次调用无改动
    expect(dedupeCatalogFiles(meta)).toBe(false);
  });

  it("repairMappingMeta heals metas that accumulated duplicate file entries", () => {
    const meta = {
      mapping_roots: [],
      folders: [],
      files: [
        { id: "f1", path: "p", version: 51, updated_at: "2026-07-02T14:04:18Z" },
        { id: "f1", path: "p", version: 13, updated_at: "2026-07-02T13:33:29Z" },
      ],
    };
    expect(repairMappingMeta(meta)).toBe(true);
    expect(meta.files).toHaveLength(1);
    expect(meta.files[0].version).toBe(51);
  });

  it("does not duplicate externally tracked files across scan checkpoint merges", () => {
    const external = {
      id: "ext-1",
      path: "C:/topics/tracked.smm",
      folder_id: null,
      origin: "external",
      version: 13,
      updated_at: "2026-07-02T13:33:29.893Z",
      content_sha256: "sha-13",
    };
    const current = {
      version: 1,
      mapping_roots: [],
      folders: [],
      files: [external],
    };
    // 扫描输出里同样带这个外部文件（外部跟踪文件轮询会 ingest 它）
    const scanned = {
      version: 1,
      mapping_roots: [],
      folders: [],
      files: [{ ...external }],
    };

    let merged = mergeScanCheckpoint(scanned, current);
    expect(
      merged.files.filter((file) => file.id === "ext-1"),
    ).toHaveLength(1);
    // 再合并一轮（模拟多次 checkpoint）也不会累积
    merged = mergePartialScanCheckpoint(scanned, merged);
    expect(
      merged.files.filter((file) => file.id === "ext-1"),
    ).toHaveLength(1);
  });

  it("keeps the in-app saved (fresher) entry when scan snapshot is stale", () => {
    const savedInApp = {
      id: "ext-1",
      path: "C:/topics/tracked.smm",
      folder_id: null,
      origin: "external",
      version: 51,
      updated_at: "2026-07-02T14:04:18.270Z",
      content_sha256: "sha-51",
    };
    const staleScanCopy = {
      ...savedInApp,
      version: 13,
      updated_at: "2026-07-02T13:33:29.893Z",
      content_sha256: "sha-13",
    };
    const current = {
      version: 1,
      mapping_roots: [],
      folders: [],
      files: [savedInApp],
    };
    const scanned = {
      version: 1,
      mapping_roots: [],
      folders: [],
      files: [staleScanCopy],
    };

    const merged = mergeScanCheckpoint(scanned, current);
    const entry = merged.files.filter((file) => file.id === "ext-1");
    expect(entry).toHaveLength(1);
    expect(entry[0].version).toBe(51);
    expect(entry[0].content_sha256).toBe("sha-51");
  });

  it("forces mapping roots to the tree root", () => {
    const meta = {
      mapping_roots: [
        {
          id: "root-1",
          mountFolderId: "mount-1",
          parent_folder_id: "nested-parent",
        },
      ],
      folders: [
        { id: "nested-parent", parent_id: null },
        {
          id: "mount-1",
          parent_id: "nested-parent",
          is_mapping_root: true,
        },
        { id: "child-1", parent_id: "mount-1" },
      ],
      files: [],
    };

    expect(normalizeMappingRootPlacement(meta)).toBe(true);
    expect(meta.mapping_roots[0].parent_folder_id).toBeNull();
    expect(meta.folders.find((folder) => folder.id === "mount-1")?.parent_id).toBeNull();
  });

  it("dedupes mapping roots that point at the same absolute path", () => {
    const meta = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
        { id: "root-2", mountFolderId: "mount-2", absPath: "/tmp/a" },
      ],
      folders: [
        { id: "mount-1", parent_id: null, is_mapping_root: true },
        { id: "child-1", parent_id: "mount-1" },
        { id: "mount-2", parent_id: null, is_mapping_root: true },
        { id: "child-2", parent_id: "mount-2" },
      ],
      files: [
        { id: "f1", folder_id: "child-1" },
        { id: "f2", folder_id: "child-2" },
      ],
    };

    expect(dedupeMappingRoots(meta)).toBe(true);
    expect(meta.mapping_roots).toHaveLength(1);
    expect(meta.mapping_roots[0].mountFolderId).toBe("mount-1");
    expect(meta.folders.map((folder) => folder.id)).toEqual([
      "mount-1",
      "child-1",
    ]);
    expect(meta.files.map((file) => file.id)).toEqual(["f1"]);
  });

  it("collapses duplicate folder records that share the same path key", () => {
    const meta = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
      ],
      folders: [
        { id: "mount-1", path: "/tmp/a", parent_id: null, is_mapping_root: true },
        { id: "mount-dup", path: "/tmp/a", parent_id: null, is_mapping_root: true },
        { id: "child-1", path: "/tmp/a/child", parent_id: "mount-dup" },
      ],
      files: [{ id: "f1", folder_id: "child-1", path: "/tmp/a/child/file.smm" }],
    };

    expect(repairMappingMeta(meta)).toBe(true);
    expect(meta.folders.map((folder) => folder.id).sort()).toEqual([
      "child-1",
      "mount-1",
    ]);
    expect(meta.files[0].folder_id).toBe("child-1");
  });

  it("drops removed mapping roots from scan checkpoints", () => {
    const current = {
      mapping_roots: [],
      folders: [{ id: "workspace", parent_id: null }],
      files: [{ id: "w1", folder_id: "workspace" }],
    };
    const scanned = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
      ],
      folders: [
        { id: "mount-1", parent_id: null, is_mapping_root: true },
        { id: "child-1", parent_id: "mount-1" },
      ],
      files: [
        { id: "f1", folder_id: "mount-1" },
        { id: "f2", folder_id: "child-1" },
      ],
    };

    const merged = mergeScanCheckpoint(scanned, current);
    expect(merged.mapping_roots).toEqual([]);
    expect(merged.folders.map((folder) => folder.id)).toEqual(["workspace"]);
    expect(merged.files.map((file) => file.id)).toEqual(["w1"]);
  });

  it("keeps active mapping scan output while preserving workspace entries", () => {
    const current = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
      ],
      folders: [
        { id: "workspace", parent_id: null },
        { id: "mount-1", parent_id: null, is_mapping_root: true },
      ],
      files: [{ id: "w1", folder_id: "workspace" }],
    };
    const scanned = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
        { id: "root-2", mountFolderId: "mount-2", absPath: "/tmp/b" },
      ],
      folders: [
        { id: "mount-1", parent_id: null, is_mapping_root: true },
        { id: "child-1", parent_id: "mount-1" },
        { id: "mount-2", parent_id: null, is_mapping_root: true },
      ],
      files: [
        { id: "f1", folder_id: "child-1" },
        { id: "f2", folder_id: "mount-2" },
      ],
    };

    const merged = mergeScanCheckpoint(scanned, current);
    expect(merged.mapping_roots).toHaveLength(1);
    expect(merged.folders.map((folder) => folder.id).sort()).toEqual([
      "child-1",
      "mount-1",
      "workspace",
    ]);
    expect(merged.files.map((file) => file.id).sort()).toEqual(["f1", "w1"]);
    expect(reconcileScanMetaWithMappingRoots(scanned, current).folders.map((f) => f.id)).toEqual([
      "mount-1",
      "child-1",
    ]);
  });

  it("preserves unseen active mapping entries while merging partial scan checkpoints", () => {
    const current = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
      ],
      folders: [
        { id: "mount-1", parent_id: null, is_mapping_root: true },
        { id: "child-seen", parent_id: "mount-1" },
        { id: "child-unseen", parent_id: "mount-1" },
      ],
      files: [
        { id: "seen-file", folder_id: "child-seen" },
        { id: "unseen-file", folder_id: "child-unseen" },
      ],
    };
    const partial = {
      mapping_roots: [
        { id: "root-1", mountFolderId: "mount-1", absPath: "/tmp/a" },
      ],
      folders: [
        { id: "mount-1", parent_id: null, is_mapping_root: true },
        { id: "child-seen", parent_id: "mount-1", updated_at: "fresh" },
      ],
      files: [{ id: "seen-file", folder_id: "child-seen", scan_pending: true }],
    };

    const merged = mergePartialScanCheckpoint(partial, current);

    expect(merged.folders.map((folder) => folder.id).sort()).toEqual([
      "child-seen",
      "child-unseen",
      "mount-1",
    ]);
    expect(merged.files.map((file) => file.id).sort()).toEqual([
      "seen-file",
      "unseen-file",
    ]);
    expect(merged.folders.find((folder) => folder.id === "child-seen")?.updated_at).toBe("fresh");
    expect(mergeScanCheckpoint(partial, current).files.map((file) => file.id)).toEqual([
      "seen-file",
    ]);
  });
});
