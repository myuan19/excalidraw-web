import { mkdirSync, mkdtempSync, rmSync, statSync } from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { FolderMappingStore } from "./store.js";

describe("FolderMappingStore updated_at 磁盘对齐", () => {
  let workspacePath = null;

  afterEach(() => {
    if (workspacePath) {
      rmSync(workspacePath, { recursive: true, force: true });
      workspacePath = null;
    }
  });

  const MOUNT_FOLDER_ID = "mount-folder";

  function createStore() {
    workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-store-timestamps-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    const store = new FolderMappingStore({ workspacePath });
    const meta = store.loadMeta();
    meta.mapping_roots = [
      {
        id: "root-1",
        absPath: mappedDir,
        mountFolderId: MOUNT_FOLDER_ID,
        parent_folder_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    meta.folders = [
      {
        id: MOUNT_FOLDER_ID,
        parent_id: null,
        name: "mapped",
        sort_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: store.sidecar.storePathKey(mappedDir),
        is_mapping_root: true,
        mapping_root_id: "root-1",
      },
    ];
    store.sidecar.save(meta);
    return store;
  }

  function diskMtimeIso(store, fileId) {
    const meta = store.loadMeta();
    const file = meta.files.find((item) => item.id === fileId);
    return statSync(store.sidecar.resolve(file.path)).mtime.toISOString();
  }

  it("数据保存后 updated_at 等于磁盘 mtime（扫描 stat 快速通道可命中）", () => {
    const store = createStore();
    const created = store.createFile({
      name: "demo",
      kind: "mindmap",
      folder_id: MOUNT_FOLDER_ID,
    });
    expect(created.updated_at).toBe(diskMtimeIso(store, created.id));

    const saved = store.saveFile(created.id, {
      data: {
        root: { data: { text: "保存后的内容" }, children: [] },
        layout: "logicalStructure",
      },
      expectedVersion: created.version,
    });
    expect(saved.updated_at).toBe(diskMtimeIso(store, created.id));

    const meta = store.loadMeta();
    const entry = meta.files.find((item) => item.id === created.id);
    expect(entry.updated_at).toBe(diskMtimeIso(store, created.id));
  });

  it("仅上传缩略图不改 updated_at（文档内容未变）", () => {
    const store = createStore();
    const created = store.createFile({
      name: "demo",
      kind: "mindmap",
      folder_id: MOUNT_FOLDER_ID,
    });
    const saved = store.saveFile(created.id, {
      data: {
        root: { data: { text: "内容" }, children: [] },
        layout: "logicalStructure",
      },
      expectedVersion: created.version,
    });

    const result = store.saveFileThumbnail(created.id, {
      thumbnail:
        '<svg xmlns="http://www.w3.org/2000/svg"><text>缩略图</text></svg>',
      contentSha256: saved.content_sha256,
    });
    expect(result.ok).toBe(true);
    expect(result.updated_at).toBe(saved.updated_at);

    const entry = store
      .loadMeta()
      .files.find((item) => item.id === created.id);
    expect(entry.updated_at).toBe(saved.updated_at);
  });
});
