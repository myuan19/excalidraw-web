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

  it("keeps the thumbnail when the file was saved in-app while the scan was running", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-async-scan-midsave-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    const absPath = path.join(mappedDir, "demo.smm");
    const newRaw = JSON.stringify({
      root: { data: { text: "已保存的新内容" }, children: [] },
      layout: "logicalStructure",
    });
    writeFileSync(absPath, newRaw, "utf-8");

    const sidecar = new FolderMappingSidecar(workspacePath);
    sidecar.ensure();
    const mountFolderId = "mount-folder";
    const fileId = "file-1";
    const baseFile = {
      id: fileId,
      name: "demo",
      kind: "mindmap",
      folder_id: mountFolderId,
      sort_index: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date(0).toISOString(),
      version: 3,
      path: sidecar.storePathKey(absPath),
      origin: "managed",
      archives: [],
      health: "ok",
      parse_error: null,
    };
    const mappingMeta = {
      mapping_roots: [
        {
          id: "root-1",
          absPath: mappedDir,
          mountFolderId,
          parent_folder_id: null,
          created_at: new Date().toISOString(),
        },
      ],
      folders: [
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
      ],
    };
    // 实时 meta（保存已落盘）：sha 与磁盘一致、版本已抬升。
    const { createHash } = await import("crypto");
    const newSha = createHash("sha256").update(newRaw).digest("hex");
    sidecar.save({
      ...sidecar.load(),
      ...mappingMeta,
      files: [{ ...baseFile, content_sha256: newSha, version: 4 }],
    });
    // 扫描持有的过期快照：还是保存前的旧 sha。
    const staleMeta = {
      ...sidecar.load(),
      ...mappingMeta,
      files: [{ ...baseFile, content_sha256: "stale-old-sha" }],
    };
    writeFileSync(
      sidecar.thumbnailPath(fileId),
      '<svg data-fresh-thumb="1"><text>新缩略图</text></svg>',
      "utf-8",
    );

    const scanned = await scanCatalogAsync(sidecar, staleMeta, {
      contentMode: "full",
    });
    const nextFile = scanned.files.find((file) => file.id === fileId);
    // 实时 meta 已记录同一 sha：不是外部变更，缩略图保留、版本不再抬升。
    expect(existsSync(sidecar.thumbnailPath(fileId))).toBe(true);
    expect(
      readFileSync(sidecar.thumbnailPath(fileId), "utf-8"),
    ).toContain("data-fresh-thumb");
    expect(nextFile?.content_sha256).toBe(newSha);
    expect(nextFile?.version).toBe(4);

    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("still deletes the thumbnail when disk content changed externally", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-async-scan-external-change-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    const absPath = path.join(mappedDir, "demo.smm");
    writeFileSync(
      absPath,
      JSON.stringify({
        root: { data: { text: "外部修改后的内容" }, children: [] },
        layout: "logicalStructure",
      }),
      "utf-8",
    );

    const sidecar = new FolderMappingSidecar(workspacePath);
    sidecar.ensure();
    const mountFolderId = "mount-folder";
    const fileId = "file-1";
    const baseFile = {
      id: fileId,
      name: "demo",
      kind: "mindmap",
      folder_id: mountFolderId,
      sort_index: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date(0).toISOString(),
      content_sha256: "old-sha-before-external-edit",
      version: 3,
      path: sidecar.storePathKey(absPath),
      origin: "managed",
      archives: [],
      health: "ok",
      parse_error: null,
    };
    const mappingMeta = {
      mapping_roots: [
        {
          id: "root-1",
          absPath: mappedDir,
          mountFolderId,
          parent_folder_id: null,
          created_at: new Date().toISOString(),
        },
      ],
      folders: [
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
      ],
    };
    // 实时 meta 与快照一致（应用内没有保存过）：磁盘变化确属外部修改。
    sidecar.save({ ...sidecar.load(), ...mappingMeta, files: [baseFile] });
    const meta = { ...sidecar.load(), ...mappingMeta, files: [baseFile] };
    writeFileSync(
      sidecar.thumbnailPath(fileId),
      '<svg data-old-thumb="1"><text>旧缩略图</text></svg>',
      "utf-8",
    );

    const scanned = await scanCatalogAsync(sidecar, meta, {
      contentMode: "full",
    });
    const nextFile = scanned.files.find((file) => file.id === fileId);
    expect(existsSync(sidecar.thumbnailPath(fileId))).toBe(false);
    expect(nextFile?.version).toBe(4);

    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("keeps the thumbnail when duplicate meta entries left a stale copy last", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-async-scan-dup-entries-"),
    );
    const trackedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-tracked-"),
    );
    const absPath = path.join(trackedDir, "tracked.smm");
    const raw = JSON.stringify({
      root: { data: { text: "最新内容" }, children: [] },
      layout: "logicalStructure",
    });
    writeFileSync(absPath, raw, "utf-8");
    const { createHash } = await import("crypto");
    const freshSha = createHash("sha256").update(raw).digest("hex");

    const sidecar = new FolderMappingSidecar(workspacePath);
    sidecar.ensure();
    const fileId = "file-dup";
    const baseFile = {
      id: fileId,
      name: "tracked",
      kind: "mindmap",
      folder_id: null,
      sort_index: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date(0).toISOString(),
      path: sidecar.storePathKey(absPath),
      origin: "external",
      archives: [],
      health: "ok",
      parse_error: null,
    };
    // 复现历史脏数据：同一文件多条记录，第一条是 API 更新过的新条目，
    // 最后一条是过期条目（Map 覆盖时旧行为会取到它 → 误删缩略图）。
    const duplicatedFiles = [
      { ...baseFile, content_sha256: freshSha, version: 51, updated_at: new Date().toISOString() },
      { ...baseFile, content_sha256: "stale-sha-12", version: 12 },
      { ...baseFile, content_sha256: "stale-sha-13", version: 13 },
    ];
    const mappingMeta = {
      mapping_roots: [
        {
          id: "root-1",
          absPath: workspacePath,
          mountFolderId: "mount-folder",
          parent_folder_id: null,
          created_at: new Date().toISOString(),
        },
      ],
      folders: [
        {
          id: "mount-folder",
          parent_id: null,
          name: "workspace",
          sort_index: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          path: sidecar.storePathKey(workspacePath),
          is_mapping_root: true,
          mapping_root_id: "root-1",
        },
      ],
    };
    sidecar.save({ ...sidecar.load(), ...mappingMeta, files: duplicatedFiles });
    const meta = { ...sidecar.load(), ...mappingMeta, files: duplicatedFiles };
    writeFileSync(
      sidecar.thumbnailPath(fileId),
      '<svg data-fresh-thumb="1"><text>新缩略图</text></svg>',
      "utf-8",
    );

    const scanned = await scanCatalogAsync(sidecar, meta, {
      contentMode: "full",
    });
    const entries = scanned.files.filter((file) => file.id === fileId);
    expect(entries).toHaveLength(1);
    expect(entries[0].content_sha256).toBe(freshSha);
    expect(entries[0].version).toBe(51);
    expect(existsSync(sidecar.thumbnailPath(fileId))).toBe(true);

    rmSync(workspacePath, { recursive: true, force: true });
    rmSync(trackedDir, { recursive: true, force: true });
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
