import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { scanCatalogAsync } from "./asyncScan.js";
import { FolderMappingSidecar } from "./sidecar.js";

describe("scanCatalogAsync", () => {
  it("indexes mapped folders in the background without blocking on full reads first", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-async-scan-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    writeFileSync(
      path.join(mappedDir, "a.smm"),
      JSON.stringify({
        root: { data: { text: "A" }, children: [] },
        layout: "logicalStructure",
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(mappedDir, "b.excalidraw"),
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [],
        appState: {},
        files: {},
      }),
      "utf-8",
    );

    const sidecar = new FolderMappingSidecar(workspacePath);
    sidecar.ensure();
    const mountFolderId = "mount-folder";
    const meta = sidecar.load();
    meta.mapping_roots = [
      {
        id: "root-1",
        absPath: mappedDir,
        mountFolderId,
        parent_folder_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    meta.folders = [
      {
        id: mountFolderId,
        parent_id: null,
        name: "mapped",
        sort_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: sidecar.storePathKey(mappedDir),
        is_mapping_root: true,
        mapping_root_id: "root-1",
      },
    ];

    const statPass = await scanCatalogAsync(sidecar, meta, {
      contentMode: "stat-only",
    });
    expect(statPass.files).toHaveLength(2);
    expect(statPass.files.every((file) => file.scan_pending)).toBe(true);

    const enriched = await scanCatalogAsync(sidecar, statPass, {
      contentMode: "pending-only",
    });
    expect(enriched.files).toHaveLength(2);
    expect(enriched.files.every((file) => file.health === "ok")).toBe(true);
    expect(enriched.files.every((file) => file.content_sha256)).toBe(true);
    const mindmapFile = enriched.files.find((file) => file.kind === "mindmap");
    const excalidrawFile = enriched.files.find((file) => file.kind === "excalidraw");
    expect(mindmapFile).toBeTruthy();
    expect(excalidrawFile).toBeTruthy();
    expect(existsSync(sidecar.thumbnailPath(mindmapFile.id))).toBe(false);
    expect(existsSync(sidecar.thumbnailPath(excalidrawFile.id))).toBe(true);

    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("does not duplicate mount folders when duplicate mapping roots share a path", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-async-scan-dedupe-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });

    const sidecar = new FolderMappingSidecar(workspacePath);
    sidecar.ensure();
    const mountFolderId = "mount-folder";
    const meta = sidecar.load();
    meta.mapping_roots = [
      {
        id: "root-1",
        absPath: mappedDir,
        mountFolderId,
        parent_folder_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "root-2",
        absPath: mappedDir,
        mountFolderId: "mount-dup",
        parent_folder_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    meta.folders = [
      {
        id: mountFolderId,
        parent_id: null,
        name: "mapped",
        sort_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: sidecar.storePathKey(mappedDir),
        is_mapping_root: true,
        mapping_root_id: "root-1",
      },
      {
        id: "mount-dup",
        parent_id: null,
        name: "mapped",
        sort_index: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: sidecar.storePathKey(mappedDir),
        is_mapping_root: true,
        mapping_root_id: "root-2",
      },
    ];

    const scanned = await scanCatalogAsync(sidecar, meta, {
      contentMode: "stat-only",
    });
    expect(scanned.mapping_roots).toHaveLength(1);
    expect(
      scanned.folders.filter((folder) => folder.is_mapping_root),
    ).toHaveLength(1);

    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("regenerates stale thumbnails when an existing mapped file had no content hash", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-async-scan-stale-thumb-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    const absPath = path.join(mappedDir, "demo.smm");
    writeFileSync(
      absPath,
      JSON.stringify({
        root: { data: { text: "Fresh" }, children: [] },
        layout: "logicalStructure",
      }),
      "utf-8",
    );

    const sidecar = new FolderMappingSidecar(workspacePath);
    sidecar.ensure();
    const mountFolderId = "mount-folder";
    const fileId = "file-1";
    const meta = sidecar.load();
    meta.mapping_roots = [
      {
        id: "root-1",
        absPath: mappedDir,
        mountFolderId,
        parent_folder_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    meta.folders = [
      {
        id: mountFolderId,
        parent_id: null,
        name: "mapped",
        sort_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: sidecar.storePathKey(mappedDir),
        is_mapping_root: true,
        mapping_root_id: "root-1",
      },
    ];
    meta.files = [
      {
        id: fileId,
        name: "demo",
        kind: "mindmap",
        folder_id: mountFolderId,
        sort_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date(0).toISOString(),
        content_sha256: null,
        version: 0,
        path: sidecar.storePathKey(absPath),
        origin: "managed",
        archives: [],
        health: "ok",
        parse_error: null,
      },
    ];
    writeFileSync(
      sidecar.thumbnailPath(fileId),
      '<svg data-old-thumb="1"><text>Old</text></svg>',
      "utf-8",
    );

    const scanned = await scanCatalogAsync(sidecar, meta, {
      contentMode: "full",
    });
    const nextFile = scanned.files.find((file) => file.id === fileId);
    expect(nextFile?.content_sha256).toBeTruthy();
    expect(existsSync(sidecar.thumbnailPath(fileId))).toBe(false);

    rmSync(workspacePath, { recursive: true, force: true });
  });
});
