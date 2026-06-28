import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";

import {
  DOCUMENT_EXTENSIONS,
  FolderMappingSidecar,
  currentFileVersion,
  extensionForKind,
  hashJson,
  hashString,
  inferKindFromPath,
  isDocumentFile,
  nextFileVersion,
  nowIso,
  safeName,
  stripKnownExtension,
} from "./sidecar.js";
import { validateCatalogDocument } from "./catalogDocument.js";
import { createCatalogBackgroundScanner } from "./backgroundScan.js";
import {
  repairMappingMeta,
  resolveMappingRootPath,
} from "./mappingRootUtils.js";

const MAX_ARCHIVES_PER_FILE = 8;

function hashDataForFile(data) {
  return hashJson(data);
}

function knownExtension(relPath, kind) {
  const lower = relPath.toLowerCase();
  const match = DOCUMENT_EXTENSIONS.slice()
    .sort((a, b) => b.length - a.length)
    .find((extension) => lower.endsWith(extension));
  return match ?? extensionForKind(kind);
}

function withoutPrivateFields(record) {
  const publicRecord = { ...record };
  delete publicRecord.path;
  delete publicRecord.archives;
  return publicRecord;
}

function mapFolderPublic(folder) {
  return {
    ...withoutPrivateFields(folder),
    parent_id: folder.parent_id ?? null,
    sort_index: folder.sort_index ?? 0,
    is_mapping_root: !!folder.is_mapping_root,
  };
}

function withoutArchivePath(archive) {
  const publicArchive = { ...archive };
  delete publicArchive.path;
  return publicArchive;
}

function normalizeFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeExpectedVersion(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function createVersionConflictError(file, expectedVersion) {
  const error = new Error("file has been updated on the server");
  error.status = 409;
  error.code = "version_conflict";
  error.payload = {
    error: "version_conflict",
    message: "file has been updated on the server",
    version: currentFileVersion(file.version),
    content_sha256: file.content_sha256 ?? null,
    updated_at: file.updated_at,
    expectedVersion,
  };
  return error;
}

function createFileNameConflictError(targetPath) {
  const error = new Error("文件名已存在");
  error.status = 409;
  error.code = "file_name_conflict";
  error.payload = {
    error: "file_name_conflict",
    message: "文件名已存在",
    path: targetPath,
  };
  return error;
}

function createFolderNameConflictError(targetPath) {
  const error = new Error("文件夹名称已存在");
  error.status = 409;
  error.code = "folder_name_conflict";
  error.payload = {
    error: "folder_name_conflict",
    message: "文件夹名称已存在",
    path: targetPath,
  };
  return error;
}

function isExternalCatalogFile(file) {
  return file.origin === "external";
}

function defaultDocument(kind) {
  if (kind === "mindmap") {
    return {
      kind: "mindmap",
      version: 1,
      name: "未命名",
      data: {
        root: {
          data: { text: "<p>未命名</p>", richText: true, expand: true },
          children: [],
        },
        theme: { template: "classic4", config: {} },
        layout: "logicalStructure",
      },
    };
  }
  return {
    type: "excalidraw",
    version: 2,
    source: "editorhub-desktop",
    elements: [],
    appState: {},
    files: {},
  };
}

export class FolderMappingStore {
  constructor({ workspacePath, archivesEnabled = false, onCatalogUpdated } = {}) {
    this.sidecar = new FolderMappingSidecar(workspacePath);
    this.archivesEnabled = archivesEnabled;
    this.backgroundScan = createCatalogBackgroundScanner({
      sidecar: this.sidecar,
      onUpdated: onCatalogUpdated,
    });
  }

  loadMeta() {
    const meta = this.sidecar.load();
    if (repairMappingMeta(meta)) {
      this.sidecar.save(meta);
    }
    return meta;
  }

  scheduleRescan(reason = null) {
    this.backgroundScan.schedule(reason ?? { source: "store.scheduleRescan" });
  }

  getScanStatus() {
    return this.backgroundScan.getStatus();
  }

  getCapabilities() {
    return {
      folderMapping: true,
      addMappedFolder: true,
      archivesEnabled: this.archivesEnabled,
    };
  }

  addMappingRoot(absPath, _parentFolderId = null) {
    const normalized = resolveMappingRootPath(absPath);
    if (!normalized || !existsSync(normalized)) {
      const error = new Error("folder not found");
      error.status = 400;
      throw error;
    }
    if (!statSync(normalized).isDirectory()) {
      const error = new Error("not a directory");
      error.status = 400;
      throw error;
    }
    const meta = this.loadMeta();
    const existingRoot = (meta.mapping_roots ?? []).find(
      (root) => resolveMappingRootPath(root.absPath) === normalized,
    );
    if (existingRoot) {
      const folder = meta.folders.find(
        (item) => item.id === existingRoot.mountFolderId,
      );
      return {
        folder: folder ? this.mapFolder(folder) : null,
        mappingRoot: existingRoot,
        tree: this.listTree(),
        scan: this.getScanStatus(),
      };
    }
    const now = nowIso();
    const mountFolderId = randomUUID();
    const mappingRootId = randomUUID();
    const folderPath = this.sidecar.storePathKey(normalized);
    meta.mapping_roots = meta.mapping_roots ?? [];
    meta.mapping_roots.push({
      id: mappingRootId,
      absPath: normalized,
      mountFolderId,
      parent_folder_id: null,
      created_at: now,
    });
    meta.folders.push({
      id: mountFolderId,
      parent_id: null,
      name: path.basename(normalized),
      sort_index: this.nextSortIndex(meta, null),
      created_at: now,
      updated_at: now,
      path: folderPath,
      is_mapping_root: true,
      mapping_root_id: mappingRootId,
    });
    this.sidecar.save(meta);
    this.backgroundScan.schedule({
      source: "add-mapping-root",
      absPath: normalized,
      mountFolderId,
    });
    const folder = meta.folders.find((item) => item.id === mountFolderId);
    const mappingRoot = meta.mapping_roots.find(
      (item) => item.id === mappingRootId,
    );
    return {
      folder: folder ? this.mapFolder(folder) : null,
      mappingRoot,
      tree: this.listTree(),
      scan: this.getScanStatus(),
    };
  }

  importFile(id) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    if (file.origin === "managed") {
      return this.mapFile(file);
    }
    file.origin = "managed";
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return this.mapFile(file);
  }

  rescan() {
    this.backgroundScan.schedule({ source: "api-rescan" });
    return this.listTree();
  }

  listTree() {
    const meta = this.loadMeta();
    let migratedOrigins = false;
    for (const file of meta.files) {
      if (file.origin === "discovered") {
        file.origin = "managed";
        migratedOrigins = true;
      }
    }
    if (migratedOrigins) {
      this.sidecar.save(meta);
    }
    return {
      folders: meta.folders.map((folder) => this.mapFolder(folder)),
      files: meta.files
        .filter((file) => !isExternalCatalogFile(file))
        .map((file) => this.mapFile(file)),
      capabilities: this.getCapabilities(),
      scan: this.getScanStatus(),
    };
  }

  resolveFileByAbsPath(absPathInput) {
    const absPath = path.resolve(String(absPathInput || "").trim());
    if (!absPath) {
      const error = new Error("缺少文件路径");
      error.status = 400;
      error.code = "missing_path";
      throw error;
    }
    if (!existsSync(absPath)) {
      const error = new Error("文件不存在");
      error.status = 404;
      error.code = "file_not_found";
      throw error;
    }
    if (!statSync(absPath).isFile()) {
      const error = new Error("路径不是文件");
      error.status = 400;
      error.code = "not_a_file";
      throw error;
    }
    if (!isDocumentFile(path.basename(absPath))) {
      const error = new Error("不支持的文件格式");
      error.status = 400;
      error.code = "unsupported_format";
      throw error;
    }

    const meta = this.loadMeta();
    const file = meta.files.find(
      (item) => path.resolve(this.sidecar.resolve(item.path)) === absPath,
    );
    if (!file) {
      const error = new Error("文件不在已添加的文件夹中");
      error.status = 404;
      error.code = "not_in_catalog";
      throw error;
    }

    return {
      absPath,
      file: this.mapFile(file),
    };
  }

  trackFileByAbsPath(absPathInput) {
    const absPath = path.resolve(String(absPathInput || "").trim());
    if (!absPath) {
      const error = new Error("缺少文件路径");
      error.status = 400;
      error.code = "missing_path";
      throw error;
    }
    if (!existsSync(absPath)) {
      const error = new Error("文件不存在");
      error.status = 404;
      error.code = "file_not_found";
      throw error;
    }
    if (!statSync(absPath).isFile()) {
      const error = new Error("路径不是文件");
      error.status = 400;
      error.code = "not_a_file";
      throw error;
    }
    const baseName = path.basename(absPath);
    if (!isDocumentFile(baseName)) {
      const error = new Error("不支持的文件格式");
      error.status = 400;
      error.code = "unsupported_format";
      throw error;
    }

    const meta = this.loadMeta();
    const resolvedAbs = path.resolve(absPath);
    const existing = meta.files.find(
      (item) => path.resolve(this.sidecar.resolve(item.path)) === resolvedAbs,
    );
    if (existing) {
      return {
        absPath: resolvedAbs,
        file: this.mapFile(existing),
        tracked: false,
      };
    }

    const pathKind = inferKindFromPath(baseName);
    let raw = "";
    try {
      raw = readFileSync(absPath, "utf-8");
    } catch {
      const error = new Error("无法读取文件");
      error.status = 400;
      error.code = "read_failed";
      throw error;
    }
    const validation = validateCatalogDocument(raw, pathKind);
    if (!validation.ok) {
      const error = new Error(validation.message || "文件已损坏或格式不受支持");
      error.status = 422;
      error.code = validation.error || "corrupt_document";
      throw error;
    }

    const now = nowIso();
    const file = {
      id: randomUUID(),
      name: stripKnownExtension(baseName),
      kind: validation.kind,
      created_at: now,
      updated_at: now,
      folder_id: null,
      sort_index: this.nextSortIndex(meta, null),
      content_sha256: hashString(raw),
      version: 0,
      path: this.sidecar.storePathKey(absPath),
      origin: "external",
      archives: [],
      health: "ok",
      parse_error: null,
    };
    meta.files.push(file);
    this.sidecar.save(meta);

    return {
      absPath: resolvedAbs,
      file: this.mapFile(file),
      tracked: true,
    };
  }

  listFiles() {
    return this.listTree().files.sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    );
  }

  listHashes() {
    return this.loadMeta().files.map((file) => ({
      id: file.id,
      content_sha256: file.content_sha256 ?? null,
      version: currentFileVersion(file.version),
    }));
  }

  getFile(id, ifNoneMatch = "") {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    if (file.health === "corrupt") {
      return {
        file: {
          ...this.mapFile(file),
          data: null,
          corrupt: true,
        },
      };
    }
    const data = this.readDataAndRefresh(meta, file);
    if (
      file.content_sha256 &&
      this.ifNoneMatchSatisfied(ifNoneMatch, file.content_sha256)
    ) {
      return { notModified: true, content_sha256: file.content_sha256 };
    }
    return {
      file: {
        ...this.mapFile(file),
        data,
      },
    };
  }

  createFile({ name = "Untitled", folder_id: folderId, kind = "excalidraw" }) {
    const meta = this.loadMeta();
    const parentId = normalizeFolderId(folderId);
    this.assertFolder(meta, parentId);
    const now = nowIso();
    const fileName = safeName(stripKnownExtension(name));
    const extension = extensionForKind(kind);
    const absPath = this.uniquePath(
      this.folderAbsPath(meta, parentId),
      fileName,
      extension,
    );
    const data = defaultDocument(kind);
    writeFileSync(absPath, JSON.stringify(data), "utf-8");
    const file = {
      id: randomUUID(),
      name: stripKnownExtension(path.basename(absPath)),
      kind,
      created_at: now,
      updated_at: now,
      folder_id: parentId,
      sort_index: this.nextSortIndex(meta, parentId),
      content_sha256: hashJson(data),
      version: 0,
      path: this.sidecar.storePathKey(absPath),
      origin: "managed",
      archives: [],
    };
    meta.files.push(file);
    this.sidecar.save(meta);
    return this.mapFile(file);
  }

  createFolder({ name = "New Folder", parent_id: parentId }) {
    const meta = this.loadMeta();
    const normalizedParentId = normalizeFolderId(parentId);
    this.assertFolder(meta, normalizedParentId);
    const now = nowIso();
    const absPath = this.uniquePath(
      this.folderAbsPath(meta, normalizedParentId),
      safeName(name, "New Folder"),
      "",
    );
    mkdirSync(absPath, { recursive: true });
    const folder = {
      id: randomUUID(),
      parent_id: normalizedParentId,
      name: path.basename(absPath),
      sort_index: this.nextSortIndex(meta, normalizedParentId),
      created_at: now,
      updated_at: now,
      path: this.sidecar.storePathKey(absPath),
    };
    meta.folders.push(folder);
    this.sidecar.save(meta);
    return mapFolderPublic(folder);
  }

  saveFile(id, body, opts = {}) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    if (file.origin !== "managed" && file.origin !== "external") {
      file.origin = "managed";
    }
    this.refreshFileContentHash(meta, file);
    const hasData = Object.prototype.hasOwnProperty.call(body, "data");
    const hasThumbnail = Object.prototype.hasOwnProperty.call(
      body,
      "thumbnail",
    );
    const hasName = body.name !== undefined && body.name !== "";
    const data = hasData ? body.data : undefined;
    const nextSha = hasData ? hashDataForFile(data) : undefined;
    const skipDataWrite = hasData && nextSha === file.content_sha256;
    const expectedVersion = normalizeExpectedVersion(body.expectedVersion);
    const forceOverwrite = body.forceOverwrite === true;

    if (
      hasData &&
      !forceOverwrite &&
      (expectedVersion === null ||
        expectedVersion !== currentFileVersion(file.version))
    ) {
      throw createVersionConflictError(file, expectedVersion);
    }

    if (skipDataWrite && !hasName && !hasThumbnail) {
      return {
        ok: true,
        skipped: true,
        content_sha256: nextSha,
        version: currentFileVersion(file.version),
        updated_at: file.updated_at,
      };
    }

    if (hasName) {
      this.renameFileOnDisk(meta, file, body.name);
    }
    if (hasData && !skipDataWrite) {
      const ifMatch = opts.ifMatch ?? "";
      if (
        !forceOverwrite &&
        ifMatch &&
        file.content_sha256 &&
        !this.ifNoneMatchSatisfied(ifMatch, file.content_sha256)
      ) {
        const error = new Error("content conflict");
        error.status = 412;
        error.content_sha256 = file.content_sha256;
        throw error;
      }
      writeFileSync(
        this.sidecar.resolve(file.path),
        JSON.stringify(data),
        "utf-8",
      );
      file.content_sha256 = nextSha;
      file.version = nextFileVersion(file.version);
      if (this.archivesEnabled) {
        this.appendArchive(file, data, body.archiveLabel || "");
      }
    }
    if (hasThumbnail) {
      this.writeThumbnail(file, body.thumbnail);
    }
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return {
      ok: true,
      updated_at: file.updated_at,
      name: file.name,
      version: currentFileVersion(file.version),
      content_sha256: file.content_sha256 ?? null,
    };
  }

  renameFile(id, name) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    this.renameFileOnDisk(meta, file, name);
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return { ok: true, ...this.mapFile(file) };
  }

  moveFiles(fileIds, folderId) {
    const meta = this.loadMeta();
    const parentId = normalizeFolderId(folderId);
    this.assertFolder(meta, parentId);
    for (const id of fileIds) {
      const file = this.requireFile(meta, id);
      this.moveFileToFolder(meta, file, parentId);
    }
    this.sidecar.save(meta);
    return { ok: true };
  }

  deleteFile(id) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    if (!isExternalCatalogFile(file)) {
      rmSync(this.sidecar.resolve(file.path), { force: true });
    }
    this.sidecar.removeFileArtifacts(id);
    meta.files = meta.files.filter((item) => item.id !== id);
    this.sidecar.save(meta);
    return { ok: true };
  }

  renameFolder(id, body) {
    const meta = this.loadMeta();
    const folder = this.requireFolder(meta, id);
    if (folder.is_mapping_root) {
      if (Object.prototype.hasOwnProperty.call(body, "parent_id")) {
        const nextParentId = normalizeFolderId(body.parent_id);
        if (nextParentId !== folder.parent_id) {
          const error = new Error("mapped folder roots cannot be moved");
          error.status = 400;
          throw error;
        }
      }
      if (body.name !== undefined) {
        folder.name = safeName(body.name, folder.name);
      }
      folder.updated_at = nowIso();
      this.sidecar.save(meta);
      return { ok: true, ...this.mapFolder(folder) };
    }
    const nextParentId = Object.prototype.hasOwnProperty.call(body, "parent_id")
      ? normalizeFolderId(body.parent_id)
      : folder.parent_id;
    this.assertFolder(meta, nextParentId);
    if (nextParentId && this.collectFolderIds(meta, id).has(nextParentId)) {
      const error = new Error("folder cycle");
      error.status = 400;
      throw error;
    }
    const parentPath = this.folderAbsPath(meta, nextParentId);
    const currentPath = this.sidecar.resolve(folder.path);
    const requestedName =
      body.name !== undefined ? safeName(body.name, folder.name) : folder.name;
    const targetPath =
      body.name !== undefined
        ? path.join(parentPath, requestedName)
        : this.uniquePath(parentPath, folder.name, "", currentPath);
    if (targetPath !== currentPath) {
      if (body.name !== undefined && existsSync(targetPath)) {
        throw createFolderNameConflictError(targetPath);
      }
      const oldPath = folder.path;
      renameSync(currentPath, targetPath);
      this.rewriteFolderSubtreePaths(
        meta,
        oldPath,
        this.sidecar.storePathKey(targetPath),
      );
    }
    folder.name = path.basename(targetPath);
    folder.parent_id = nextParentId;
    folder.updated_at = nowIso();
    this.sidecar.save(meta);
    return { ok: true, ...withoutPrivateFields(folder) };
  }

  deleteFolder(id) {
    const meta = this.loadMeta();
    const folder = this.requireFolder(meta, id);
    const folderIds = this.collectFolderIds(meta, id);
    if (folder.is_mapping_root) {
      for (const file of meta.files.filter((item) =>
        folderIds.has(item.folder_id),
      )) {
        this.sidecar.removeFileArtifacts(file.id);
      }
      meta.mapping_roots = (meta.mapping_roots ?? []).filter(
        (root) =>
          root.mountFolderId !== folder.id &&
          root.id !== folder.mapping_root_id,
      );
      meta.files = meta.files.filter((item) => !folderIds.has(item.folder_id));
      meta.folders = meta.folders.filter((item) => !folderIds.has(item.id));
      this.sidecar.save(meta);
      this.backgroundScan.onMappingRootsChanged({
        source: "delete-mapping-root",
        folderId: folder.id,
      });
      return {
        ok: true,
        removed_mapping_root: true,
        scan: this.getScanStatus(),
      };
    }
    for (const file of meta.files.filter((item) =>
      folderIds.has(item.folder_id),
    )) {
      this.moveFileToFolder(meta, file, null);
    }
    rmSync(this.sidecar.resolve(folder.path), { recursive: true, force: true });
    meta.folders = meta.folders.filter((item) => !folderIds.has(item.id));
    this.sidecar.save(meta);
    return { ok: true };
  }

  getLocalFolderPath(id) {
    const meta = this.loadMeta();
    const folder = this.requireFolder(meta, id);
    const absPath = this.sidecar.resolve(folder.path);
    if (!this.isPathUnderMappingRoot(meta, absPath)) {
      const error = new Error("folder is not under a mapped root");
      error.status = 400;
      throw error;
    }
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      const error = new Error("folder not found");
      error.status = 404;
      throw error;
    }
    return path.resolve(absPath);
  }

  getLocalFilePath(id) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    const absPath = path.resolve(this.sidecar.resolve(file.path));
    if (!existsSync(absPath) || !statSync(absPath).isFile()) {
      const error = new Error("file not found");
      error.status = 404;
      throw error;
    }
    return absPath;
  }

  isCatalogFileContentCurrent(root, relPath) {
    if (!root || !relPath) {
      return false;
    }
    const absPath = path.resolve(root, relPath);
    if (!isDocumentFile(path.basename(absPath))) {
      return false;
    }
    let meta;
    try {
      meta = this.loadMeta();
    } catch {
      return false;
    }
    const file = meta.files.find(
      (item) => path.resolve(this.sidecar.resolve(item.path)) === absPath,
    );
    if (!file?.content_sha256) {
      return false;
    }
    try {
      if (!existsSync(absPath) || !statSync(absPath).isFile()) {
        return false;
      }
      return hashString(readFileSync(absPath, "utf-8")) === file.content_sha256;
    } catch {
      return false;
    }
  }

  saveOrder(parentId, items) {
    const meta = this.loadMeta();
    const normalizedParentId = normalizeFolderId(parentId);
    this.assertFolder(meta, normalizedParentId);
    items.forEach((item, sortIndex) => {
      if (item.type === "folder") {
        const folder = this.requireFolder(meta, item.id);
        if (
          folder.id !== normalizedParentId &&
          !this.collectFolderIds(meta, folder.id).has(normalizedParentId)
        ) {
          this.moveFolderToParent(meta, folder, normalizedParentId);
          folder.sort_index = sortIndex;
        }
      } else if (item.type === "file") {
        const file = this.requireFile(meta, item.id);
        this.moveFileToFolder(meta, file, normalizedParentId);
        file.sort_index = sortIndex;
      }
    });
    this.sidecar.save(meta);
    return { ok: true };
  }

  getThumbnail(id) {
    const meta = this.loadMeta();
    this.requireFile(meta, id);
    const thumbnailPath = this.sidecar.thumbnailPath(id);
    if (!existsSync(thumbnailPath)) {
      return null;
    }
    return readFileSync(thumbnailPath, "utf-8");
  }

  saveFileThumbnail(id, body) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, id);
    this.refreshFileContentHash(meta, file);
    const thumbnail =
      typeof body?.thumbnail === "string" ? body.thumbnail.trim() : "";
    const contentSha256 =
      typeof body?.contentSha256 === "string"
        ? body.contentSha256.trim()
        : "";
    const currentSha = file.content_sha256 ?? null;

    if (!thumbnail || !/<svg\b/i.test(thumbnail) || !/<\/svg>/i.test(thumbnail)) {
      const error = new Error("invalid_thumbnail");
      error.status = 400;
      throw error;
    }
    if (!contentSha256 || !currentSha || contentSha256 !== currentSha) {
      const error = new Error("stale_thumbnail");
      error.status = 409;
      error.payload = {
        error: "stale_thumbnail",
        content_sha256: currentSha,
        version: currentFileVersion(file.version),
        updated_at: file.updated_at,
      };
      throw error;
    }

    this.writeThumbnail(file, thumbnail);
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return {
      ok: true,
      content_sha256: currentSha,
      version: currentFileVersion(file.version),
      updated_at: file.updated_at,
    };
  }

  createArchive(fileId, { label = "", deltas } = {}) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, fileId);
    const data = this.readData(file);
    const payload = deltas ? { ...data, _deltas: deltas } : data;
    const archive = this.appendArchive(file, payload, label);
    this.sidecar.save(meta);
    return archive;
  }

  listArchives(fileId) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, fileId);
    return (file.archives ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, MAX_ARCHIVES_PER_FILE)
      .map(withoutArchivePath);
  }

  getArchive(fileId, archiveId) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, fileId);
    const archive = this.requireArchive(file, archiveId);
    const data = JSON.parse(
      readFileSync(this.sidecar.resolve(archive.path), "utf-8"),
    );
    return { ...archive, data };
  }

  patchArchiveLabel(fileId, archiveId, label) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, fileId);
    const archive = this.requireArchive(file, archiveId);
    archive.label = String(label ?? "");
    this.sidecar.save(meta);
    return { ok: true, ...withoutArchivePath(archive) };
  }

  restoreArchive(fileId, archiveId) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, fileId);
    const archive = this.requireArchive(file, archiveId);
    const data = JSON.parse(
      readFileSync(this.sidecar.resolve(archive.path), "utf-8"),
    );
    delete data._deltas;
    writeFileSync(
      this.sidecar.resolve(file.path),
      JSON.stringify(data),
      "utf-8",
    );
    file.content_sha256 = hashJson(data);
    file.version = nextFileVersion(file.version);
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return {
      ok: true,
      restored_from: archiveId,
      content_sha256: file.content_sha256,
      version: currentFileVersion(file.version),
    };
  }

  deleteArchive(fileId, archiveId) {
    const meta = this.loadMeta();
    const file = this.requireFile(meta, fileId);
    const archive = this.requireArchive(file, archiveId);
    rmSync(this.sidecar.resolve(archive.path), { force: true });
    file.archives = (file.archives ?? []).filter(
      (item) => item.id !== archiveId,
    );
    this.sidecar.save(meta);
    return { ok: true };
  }

  mapFile(file) {
    const origin = file.origin === "external" ? "external" : "managed";
    const health =
      file.health === "corrupt"
        ? "corrupt"
        : file.health === "pending" || file.scan_pending
        ? "pending"
        : "ok";
    return {
      ...withoutPrivateFields(file),
      kind: file.kind || inferKindFromPath(file.path),
      folder_id: file.folder_id ?? null,
      sort_index: file.sort_index ?? 0,
      archive_count: this.archivesEnabled ? (file.archives ?? []).length : 0,
      has_thumbnail:
        health === "ok" && existsSync(this.sidecar.thumbnailPath(file.id)),
      content_sha256: file.content_sha256 ?? null,
      version: currentFileVersion(file.version),
      origin,
      importable: false,
      health,
      parse_error: file.parse_error ?? null,
      corrupt: health === "corrupt",
    };
  }

  mapFolder(folder) {
    return mapFolderPublic(folder);
  }

  readData(file) {
    if (file.health === "corrupt") {
      const error = new Error(file.parse_error || "corrupt document");
      error.status = 422;
      error.code = "corrupt_document";
      throw error;
    }
    const raw = readFileSync(this.sidecar.resolve(file.path), "utf-8");
    const validation = validateCatalogDocument(raw, file.kind);
    if (!validation.ok) {
      const error = new Error(validation.message || "corrupt document");
      error.status = 422;
      error.code = "corrupt_document";
      throw error;
    }
    return validation.data;
  }

  readDataAndRefresh(meta, file) {
    if (file.health === "corrupt") {
      const error = new Error(file.parse_error || "corrupt document");
      error.status = 422;
      error.code = "corrupt_document";
      throw error;
    }
    const raw = readFileSync(this.sidecar.resolve(file.path), "utf-8");
    const validation = validateCatalogDocument(raw, file.kind);
    if (!validation.ok) {
      const error = new Error(validation.message || "corrupt document");
      error.status = 422;
      error.code = "corrupt_document";
      throw error;
    }
    this.applyDiskContentHash(meta, file, hashString(raw));
    return validation.data;
  }

  refreshFileContentHash(meta, file) {
    if (file.health === "corrupt") {
      return false;
    }
    let raw;
    try {
      raw = readFileSync(this.sidecar.resolve(file.path), "utf-8");
    } catch {
      return false;
    }
    const validation = validateCatalogDocument(raw, file.kind);
    if (!validation.ok) {
      return false;
    }
    return this.applyDiskContentHash(meta, file, hashString(raw));
  }

  applyDiskContentHash(meta, file, nextSha) {
    if (!nextSha || nextSha === file.content_sha256) {
      return false;
    }
    file.content_sha256 = nextSha;
    file.version = nextFileVersion(file.version);
    file.updated_at = nowIso();
    file.health = "ok";
    file.parse_error = null;
    this.sidecar.save(meta);
    return true;
  }

  appendArchive(file, data, label = "") {
    if (!this.archivesEnabled) {
      return null;
    }
    file.archives = file.archives ?? [];
    while (file.archives.length >= MAX_ARCHIVES_PER_FILE) {
      const oldest = file.archives.shift();
      if (oldest?.path) {
        rmSync(this.sidecar.resolve(oldest.path), { force: true });
      }
    }
    const archiveId = randomUUID();
    const createdAt = nowIso();
    const absPath = this.sidecar.archivePath(file.id, archiveId);
    writeFileSync(absPath, JSON.stringify(data), "utf-8");
    const archive = {
      id: archiveId,
      label: String(label || ""),
      created_at: createdAt,
      path: this.sidecar.relative(absPath),
      content_sha256: hashJson(data),
    };
    file.archives.push(archive);
    return withoutArchivePath(archive);
  }

  writeThumbnail(file, thumbnail) {
    const thumbnailPath = this.sidecar.thumbnailPath(file.id);
    if (thumbnail === null) {
      rmSync(thumbnailPath, { force: true });
      return;
    }
    if (typeof thumbnail === "string" && thumbnail.length > 0) {
      writeFileSync(thumbnailPath, thumbnail, "utf-8");
    }
  }

  renameFileOnDisk(meta, file, name) {
    const extension = knownExtension(file.path, file.kind);
    const currentPath = this.sidecar.resolve(file.path);
    const targetDir = isExternalCatalogFile(file)
      ? path.dirname(currentPath)
      : this.folderAbsPath(meta, file.folder_id);
    const fileName = safeName(stripKnownExtension(name), file.name);
    const targetPath = path.join(
      targetDir,
      `${fileName}${extension}`,
    );
    if (path.resolve(targetPath) !== path.resolve(currentPath)) {
      if (existsSync(targetPath)) {
        throw createFileNameConflictError(targetPath);
      }
      renameSync(currentPath, targetPath);
      file.path = this.sidecar.storePathKey(targetPath);
    }
    file.name = stripKnownExtension(path.basename(targetPath));
  }

  moveFileToFolder(meta, file, folderId) {
    if (file.folder_id === folderId) {
      return;
    }
    const currentPath = this.sidecar.resolve(file.path);
    const targetPath = this.uniquePath(
      this.folderAbsPath(meta, folderId),
      file.name,
      knownExtension(file.path, file.kind),
    );
    renameSync(currentPath, targetPath);
    file.path = this.sidecar.storePathKey(targetPath);
    file.folder_id = folderId;
    file.sort_index = this.nextSortIndex(meta, folderId);
    file.updated_at = nowIso();
  }

  moveFolderToParent(meta, folder, parentId) {
    if (folder.parent_id === parentId) {
      return;
    }
    const currentPath = this.sidecar.resolve(folder.path);
    const targetPath = this.uniquePath(
      this.folderAbsPath(meta, parentId),
      folder.name,
      "",
    );
    const oldPath = folder.path;
    renameSync(currentPath, targetPath);
    this.rewriteFolderSubtreePaths(
      meta,
      oldPath,
      this.sidecar.storePathKey(targetPath),
    );
    folder.parent_id = parentId;
    folder.updated_at = nowIso();
  }

  rewriteFolderSubtreePaths(meta, oldRoot, newRoot) {
    for (const folder of meta.folders) {
      if (folder.path === oldRoot || folder.path.startsWith(`${oldRoot}/`)) {
        folder.path = `${newRoot}${folder.path.slice(oldRoot.length)}`;
      }
    }
    for (const file of meta.files) {
      if (file.path.startsWith(`${oldRoot}/`)) {
        file.path = `${newRoot}${file.path.slice(oldRoot.length)}`;
      }
    }
  }

  uniquePath(parentPath, name, extension, currentPath = "") {
    mkdirSync(parentPath, { recursive: true });
    const base = safeName(name);
    for (let index = 0; index < 1000; index += 1) {
      const suffix = index === 0 ? "" : ` (${index})`;
      const candidate = path.join(parentPath, `${base}${suffix}${extension}`);
      if (
        currentPath &&
        path.resolve(candidate) === path.resolve(currentPath)
      ) {
        return candidate;
      }
      if (!existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error(`Unable to allocate unique path for ${name}`);
  }

  folderAbsPath(meta, folderId) {
    if (!folderId) {
      const error = new Error("folder not found");
      error.status = 404;
      throw error;
    }
    return this.sidecar.resolve(this.requireFolder(meta, folderId).path);
  }

  isFileUnderMappingRoot(meta, file) {
    return this.isPathUnderMappingRoot(meta, this.sidecar.resolve(file.path));
  }

  isPathUnderMappingRoot(meta, absPath) {
    const resolvedPath = path.resolve(absPath);
    return (meta.mapping_roots ?? []).some((root) => {
      if (!root?.absPath) {
        return false;
      }
      const mappingRoot = path.resolve(root.absPath);
      return (
        resolvedPath === mappingRoot ||
        resolvedPath.startsWith(`${mappingRoot}${path.sep}`)
      );
    });
  }

  nextSortIndex(meta, parentId) {
    const folderIndexes = meta.folders
      .filter((item) => item.parent_id === parentId)
      .map((item) => item.sort_index ?? 0);
    const fileIndexes = meta.files
      .filter((item) => item.folder_id === parentId)
      .map((item) => item.sort_index ?? 0);
    return Math.max(-1, ...folderIndexes, ...fileIndexes) + 1;
  }

  requireFile(meta, id) {
    const file = meta.files.find((item) => item.id === id);
    if (!file) {
      const error = new Error("not found");
      error.status = 404;
      throw error;
    }
    return file;
  }

  requireFolder(meta, id) {
    const folder = meta.folders.find((item) => item.id === id);
    if (!folder) {
      const error = new Error("folder not found");
      error.status = 404;
      throw error;
    }
    return folder;
  }

  assertFolder(meta, id) {
    if (id) {
      this.requireFolder(meta, id);
    }
  }

  requireArchive(file, archiveId) {
    const archive = (file.archives ?? []).find((item) => item.id === archiveId);
    if (!archive) {
      const error = new Error("archive not found");
      error.status = 404;
      throw error;
    }
    return archive;
  }

  collectFolderIds(meta, folderId) {
    const ids = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of meta.folders) {
        if (
          folder.parent_id &&
          ids.has(folder.parent_id) &&
          !ids.has(folder.id)
        ) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  ifNoneMatchSatisfied(header, sha) {
    if (!header || !sha) {
      return false;
    }
    return header
      .split(",")
      .map((part) => part.trim().replace(/^W\//, "").replace(/^"|"$/g, ""))
      .includes(sha);
  }
}

export function createFolderMappingStore(options) {
  return new FolderMappingStore(options);
}
