import { describe, expect, it } from "vitest";

import {
  dedupeFoldersByPath,
  dedupeMappingRoots,
  mergePartialScanCheckpoint,
  mergeScanCheckpoint,
  normalizeMappingRootPlacement,
  reconcileScanMetaWithMappingRoots,
  repairMappingMeta,
} from "./mappingRootUtils.js";

describe("mappingRootUtils", () => {
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
