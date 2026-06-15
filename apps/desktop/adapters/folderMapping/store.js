import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";

import {
  DOCUMENT_EXTENSIONS,
  FolderMappingSidecar,
  extensionForKind,
  hashJson,
  inferKindFromPath,
  nowIso,
  safeName,
  stripKnownExtension,
} from "./sidecar.js";

const MAX_ARCHIVES_PER_FILE = 8;

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

function withoutArchivePath(archive) {
  const publicArchive = { ...archive };
  delete publicArchive.path;
  return publicArchive;
}

function normalizeFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function defaultDocument(kind) {
  if (kind === "mindmap") {
    return {
      kind: "mindmap",
      version: 1,
      name: "Untitled",
      data: {
        root: { data: { text: "Untitled" }, children: [] },
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
  constructor({ workspacePath }) {
    this.sidecar = new FolderMappingSidecar(workspacePath);
  }

  listTree() {
    const meta = this.sidecar.loadAndScan();
    return {
      folders: meta.folders.map((folder) => withoutPrivateFields(folder)),
      files: meta.files.map((file) => this.mapFile(file)),
    };
  }

  listFiles() {
    return this.listTree().files.sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    );
  }

  listHashes() {
    return this.sidecar.loadAndScan().files.map((file) => ({
      id: file.id,
      content_sha256: file.content_sha256 ?? null,
    }));
  }

  getFile(id, ifNoneMatch = "") {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, id);
    const data = this.readData(file);
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
    const meta = this.sidecar.loadAndScan();
    const parentId = normalizeFolderId(folderId);
    this.assertFolder(meta, parentId);
    const now = nowIso();
    const fileName = safeName(name);
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
      name: fileName,
      kind,
      created_at: now,
      updated_at: now,
      folder_id: parentId,
      sort_index: this.nextSortIndex(meta, parentId),
      content_sha256: hashJson(data),
      path: this.sidecar.relative(absPath),
      archives: [],
    };
    meta.files.push(file);
    this.sidecar.save(meta);
    return this.mapFile(file);
  }

  createFolder({ name = "New Folder", parent_id: parentId }) {
    const meta = this.sidecar.loadAndScan();
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
      path: this.sidecar.relative(absPath),
    };
    meta.folders.push(folder);
    this.sidecar.save(meta);
    return withoutPrivateFields(folder);
  }

  saveFile(id, body) {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, id);
    const hasData = Object.prototype.hasOwnProperty.call(body, "data");
    const hasThumbnail = Object.prototype.hasOwnProperty.call(
      body,
      "thumbnail",
    );
    const hasName = body.name !== undefined && body.name !== "";
    const data = hasData ? body.data : undefined;
    const nextSha = hasData ? hashJson(data) : undefined;
    const skipDataWrite = hasData && nextSha === file.content_sha256;

    if (skipDataWrite && !hasName && !hasThumbnail) {
      return {
        ok: true,
        skipped: true,
        content_sha256: nextSha,
        updated_at: file.updated_at,
      };
    }

    if (hasName) {
      this.renameFileOnDisk(meta, file, body.name);
    }
    if (hasData && !skipDataWrite) {
      writeFileSync(
        this.sidecar.resolve(file.path),
        JSON.stringify(data),
        "utf-8",
      );
      file.content_sha256 = nextSha;
      this.appendArchive(file, data, body.archiveLabel || "");
    }
    if (hasThumbnail) {
      this.writeThumbnail(file, body.thumbnail);
    }
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return {
      ok: true,
      updated_at: file.updated_at,
      ...(hasData && { content_sha256: file.content_sha256 }),
    };
  }

  renameFile(id, name) {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, id);
    this.renameFileOnDisk(meta, file, name);
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return { ok: true, ...this.mapFile(file) };
  }

  moveFiles(fileIds, folderId) {
    const meta = this.sidecar.loadAndScan();
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
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, id);
    rmSync(this.sidecar.resolve(file.path), { force: true });
    this.sidecar.removeFileArtifacts(id);
    meta.files = meta.files.filter((item) => item.id !== id);
    this.sidecar.save(meta);
    return { ok: true };
  }

  renameFolder(id, body) {
    const meta = this.sidecar.loadAndScan();
    const folder = this.requireFolder(meta, id);
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
    const targetPath = this.uniquePath(
      parentPath,
      body.name !== undefined ? safeName(body.name, folder.name) : folder.name,
      "",
      currentPath,
    );
    if (targetPath !== currentPath) {
      const oldPath = folder.path;
      renameSync(currentPath, targetPath);
      this.rewriteFolderSubtreePaths(
        meta,
        oldPath,
        this.sidecar.relative(targetPath),
      );
    }
    folder.name = path.basename(targetPath);
    folder.parent_id = nextParentId;
    folder.updated_at = nowIso();
    this.sidecar.save(meta);
    return { ok: true, ...withoutPrivateFields(folder) };
  }

  deleteFolder(id) {
    const meta = this.sidecar.loadAndScan();
    const folder = this.requireFolder(meta, id);
    const folderIds = this.collectFolderIds(meta, id);
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

  saveOrder(parentId, items) {
    const meta = this.sidecar.loadAndScan();
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
    const meta = this.sidecar.loadAndScan();
    this.requireFile(meta, id);
    const thumbnailPath = this.sidecar.thumbnailPath(id);
    if (!existsSync(thumbnailPath)) {
      return null;
    }
    return readFileSync(thumbnailPath, "utf-8");
  }

  createArchive(fileId, { label = "", deltas } = {}) {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, fileId);
    const data = this.readData(file);
    const payload = deltas ? { ...data, _deltas: deltas } : data;
    const archive = this.appendArchive(file, payload, label);
    this.sidecar.save(meta);
    return archive;
  }

  listArchives(fileId) {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, fileId);
    return (file.archives ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, MAX_ARCHIVES_PER_FILE)
      .map(withoutArchivePath);
  }

  getArchive(fileId, archiveId) {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, fileId);
    const archive = this.requireArchive(file, archiveId);
    const data = JSON.parse(
      readFileSync(this.sidecar.resolve(archive.path), "utf-8"),
    );
    return { ...archive, data };
  }

  patchArchiveLabel(fileId, archiveId, label) {
    const meta = this.sidecar.loadAndScan();
    const file = this.requireFile(meta, fileId);
    const archive = this.requireArchive(file, archiveId);
    archive.label = String(label ?? "");
    this.sidecar.save(meta);
    return { ok: true, ...withoutArchivePath(archive) };
  }

  restoreArchive(fileId, archiveId) {
    const meta = this.sidecar.loadAndScan();
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
    file.updated_at = nowIso();
    this.sidecar.save(meta);
    return {
      ok: true,
      restored_from: archiveId,
      content_sha256: file.content_sha256,
    };
  }

  deleteArchive(fileId, archiveId) {
    const meta = this.sidecar.loadAndScan();
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
    return {
      ...withoutPrivateFields(file),
      kind: file.kind || inferKindFromPath(file.path),
      folder_id: file.folder_id ?? null,
      sort_index: file.sort_index ?? 0,
      archive_count: (file.archives ?? []).length,
      has_thumbnail: existsSync(this.sidecar.thumbnailPath(file.id)),
      content_sha256: file.content_sha256 ?? null,
    };
  }

  readData(file) {
    const raw = readFileSync(this.sidecar.resolve(file.path), "utf-8");
    if (file.kind === "text") {
      return raw;
    }
    return JSON.parse(raw);
  }

  appendArchive(file, data, label = "") {
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
    const targetPath = this.uniquePath(
      this.folderAbsPath(meta, file.folder_id),
      safeName(name, file.name),
      extension,
      currentPath,
    );
    if (targetPath !== currentPath) {
      renameSync(currentPath, targetPath);
      file.path = this.sidecar.relative(targetPath);
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
    file.path = this.sidecar.relative(targetPath);
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
      this.sidecar.relative(targetPath),
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
      return this.sidecar.workspaceRoot;
    }
    return this.sidecar.resolve(this.requireFolder(meta, folderId).path);
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
