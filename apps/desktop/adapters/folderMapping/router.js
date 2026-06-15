import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

import {
  logDocumentError,
  logFilesOperation,
  logFilesRequest,
  logGetFile,
  logPutFile,
} from "./desktopFilesLog.mjs";

const META_VERSION = 1;
const MAX_ARCHIVES_PER_FILE = 8;
const AUTO_ARCHIVE_LABEL_PREFIX = "auto:";

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hashJson(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function formatDocumentEtag(contentSha256) {
  return contentSha256 ? `"${String(contentSha256).replace(/^"|"$/g, "")}"` : null;
}

function ifNoneMatchSatisfied(headerValue, contentSha256) {
  if (!headerValue || !contentSha256) {
    return false;
  }
  const normalized = String(contentSha256).replace(/^"|"$/g, "");
  return String(headerValue)
    .split(",")
    .map((part) => part.trim().replace(/^W\//, "").replace(/^"|"$/g, ""))
    .includes(normalized);
}

function sendNotModified(res, contentSha256) {
  const etag = formatDocumentEtag(contentSha256);
  if (etag) {
    res.setHeader("ETag", etag);
  }
  res.setHeader("Cache-Control", "private, no-cache");
  return res.status(304).end();
}

function normalizeFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeArchiveLabel(value) {
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}

function isAutoArchiveLabel(label) {
  return label.startsWith(AUTO_ARCHIVE_LABEL_PREFIX);
}

function extensionForKind(kind) {
  return kind === "mindmap" ? ".smm" : ".excalidraw";
}

function createEmptyData(kind) {
  if (kind === "mindmap") {
    return {
      kind: "mindmap",
      containerVersion: 1,
      formatVersion: 1,
      data: {
        root: {
          data: { text: "<p>MindMap</p>", richText: true, expand: true },
          children: [],
        },
        theme: "default",
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

class WorkspaceStore {
  constructor(workspacePath) {
    this.workspacePath = path.resolve(workspacePath);
    this.metaDir = path.join(this.workspacePath, ".editorhub");
    this.documentsDir = path.join(this.workspacePath, "documents");
    this.thumbnailsDir = path.join(this.metaDir, "thumbnails");
    this.archivesDir = path.join(this.metaDir, "archives");
    this.metaPath = path.join(this.metaDir, "workspace.json");
    this.ensureDirs();
  }

  ensureDirs() {
    for (const dir of [
      this.workspacePath,
      this.metaDir,
      this.documentsDir,
      this.thumbnailsDir,
      this.archivesDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    if (!fs.existsSync(this.metaPath)) {
      return { version: META_VERSION, folders: [], files: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(this.metaPath, "utf8"));
    return {
      version: META_VERSION,
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  }

  save(meta) {
    this.ensureDirs();
    const payload = JSON.stringify(
      {
        version: META_VERSION,
        folders: meta.folders ?? [],
        files: meta.files ?? [],
      },
      null,
      2,
    );
    const tmp = `${this.metaPath}.tmp`;
    fs.writeFileSync(tmp, payload, "utf8");
    fs.renameSync(tmp, this.metaPath);
  }

  documentPath(file) {
    const rel = file.path || `documents/${file.id}${extensionForKind(file.kind)}`;
    const abs = path.resolve(this.workspacePath, rel);
    const root = `${this.workspacePath}${path.sep}`;
    if (abs !== this.workspacePath && !abs.startsWith(root)) {
      throw new Error(`Invalid workspace file path: ${rel}`);
    }
    return abs;
  }

  thumbnailPath(fileId) {
    return path.join(this.thumbnailsDir, `${fileId}.svg`);
  }

  thumbnailMetaPath(fileId) {
    return path.join(this.thumbnailsDir, `${fileId}.meta.json`);
  }

  archiveDir(fileId) {
    const dir = path.join(this.archivesDir, fileId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  archivePath(fileId, archiveId) {
    return path.join(this.archiveDir(fileId), `${archiveId}.json`);
  }

  mapFile(file) {
    return {
      id: file.id,
      name: file.name,
      kind: file.kind || "excalidraw",
      created_at: file.created_at,
      updated_at: file.updated_at,
      content_sha256: file.content_sha256 ?? null,
      folder_id: file.folder_id ?? null,
      sort_index: file.sort_index ?? 0,
      archive_count: Array.isArray(file.archives) ? file.archives.length : 0,
      has_thumbnail: fs.existsSync(this.thumbnailPath(file.id)),
    };
  }

  mapFolder(folder) {
    return {
      id: folder.id,
      parent_id: folder.parent_id ?? null,
      name: folder.name,
      sort_index: folder.sort_index ?? 0,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    };
  }

  findFile(meta, id) {
    return meta.files.find((file) => file.id === id) ?? null;
  }

  findFolder(meta, id) {
    return meta.folders.find((folder) => folder.id === id) ?? null;
  }

  folderExists(meta, folderId) {
    return folderId == null || !!this.findFolder(meta, folderId);
  }

  nextSortIndex(items, parentId) {
    return (
      items
        .filter((item) => (item.folder_id ?? item.parent_id ?? null) === parentId)
        .reduce((max, item) => Math.max(max, item.sort_index ?? 0), -1) + 1
    );
  }

  getDescendantFolderIds(meta, folderId) {
    const ids = [];
    const queue = [folderId];
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      ids.push(id);
      for (const child of meta.folders.filter((folder) => folder.parent_id === id)) {
        queue.push(child.id);
      }
    }
    return ids;
  }

  wouldCreateFolderCycle(meta, folderId, nextParentId) {
    let cursor = nextParentId;
    while (cursor) {
      if (cursor === folderId) {
        return true;
      }
      cursor = this.findFolder(meta, cursor)?.parent_id ?? null;
    }
    return false;
  }

  readData(file) {
    const docPath = this.documentPath(file);
    if (!fs.existsSync(docPath)) {
      const error = new Error("file data missing");
      error.code = "FILE_DATA_MISSING";
      throw error;
    }
    try {
      return JSON.parse(fs.readFileSync(docPath, "utf8"));
    } catch (cause) {
      const error = new Error("corrupt scene file");
      error.code = "CORRUPT_SCENE_FILE";
      error.cause = cause;
      throw error;
    }
  }

  readArchiveData(fileId, archiveId) {
    const archivePath = this.archivePath(fileId, archiveId);
    if (!fs.existsSync(archivePath)) {
      const error = new Error("archive file missing");
      error.code = "ARCHIVE_FILE_MISSING";
      throw error;
    }
    try {
      return JSON.parse(fs.readFileSync(archivePath, "utf8"));
    } catch (cause) {
      const error = new Error("corrupt archive file");
      error.code = "CORRUPT_ARCHIVE_FILE";
      error.cause = cause;
      throw error;
    }
  }

  writeData(file, data) {
    const abs = this.documentPath(file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  trimArchives(file) {
    file.archives = Array.isArray(file.archives) ? file.archives : [];
    while (file.archives.length >= MAX_ARCHIVES_PER_FILE) {
      file.archives.sort((a, b) => {
        const aa = isAutoArchiveLabel(a.label || "") ? 0 : 1;
        const bb = isAutoArchiveLabel(b.label || "") ? 0 : 1;
        return aa - bb || String(a.created_at).localeCompare(String(b.created_at));
      });
      const removed = file.archives.shift();
      if (removed) {
        fs.rmSync(this.archivePath(file.id, removed.id), { force: true });
      }
    }
  }

  appendArchive(file, data, label = "") {
    file.archives = Array.isArray(file.archives) ? file.archives : [];
    if (isAutoArchiveLabel(label)) {
      for (const archive of file.archives.filter((item) => item.label === label)) {
        fs.rmSync(this.archivePath(file.id, archive.id), { force: true });
      }
      file.archives = file.archives.filter((item) => item.label !== label);
    }
    this.trimArchives(file);
    const archive = {
      id: randomUUID(),
      label,
      created_at: nowIso(),
      content_sha256: hashJson(data),
    };
    fs.writeFileSync(
      this.archivePath(file.id, archive.id),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8",
    );
    file.archives.push(archive);
    return archive;
  }
}

function assertFolder(store, meta, folderId, res) {
  if (!store.folderExists(meta, folderId)) {
    res.status(404).json({ error: "folder not found" });
    return false;
  }
  return true;
}

function sendDocumentReadError(res, error) {
  if (error?.code === "FILE_DATA_MISSING") {
    return res.status(404).json({ error: "file data missing" });
  }
  if (error?.code === "CORRUPT_SCENE_FILE") {
    return res.status(500).json({
      error: "corrupt scene file",
      message: error.cause instanceof Error ? error.cause.message : String(error.cause ?? error.message),
    });
  }
  if (error?.code === "ARCHIVE_FILE_MISSING") {
    return res.status(404).json({ error: "archive file missing" });
  }
  if (error?.code === "CORRUPT_ARCHIVE_FILE") {
    return res.status(500).json({
      error: "corrupt archive file",
      message: error.cause instanceof Error ? error.cause.message : String(error.cause ?? error.message),
    });
  }
  throw error;
}

export async function createFolderMappingRouter({ workspacePath }) {
  if (!workspacePath) {
    throw new Error("createFolderMappingRouter requires workspacePath");
  }

  const store = new WorkspaceStore(workspacePath);
  const router = Router();

  logFilesOperation("router-ready", { workspacePath });

  router.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => logFilesRequest(req, res, startedAt));
    next();
  });

  router.get("/hashes", (_req, res) => {
    const meta = store.load();
    res.json(meta.files.map((file) => ({
      id: file.id,
      content_sha256: file.content_sha256 ?? null,
    })));
  });

  router.get("/tree", (_req, res) => {
    const meta = store.load();
    res.json({
      folders: meta.folders.map((folder) => store.mapFolder(folder)),
      files: meta.files.map((file) => store.mapFile(file)),
    });
  });

  router.post("/folders", (req, res) => {
    const meta = store.load();
    const parentId = normalizeFolderId(req.body.parent_id);
    if (!assertFolder(store, meta, parentId, res)) {
      return;
    }
    const now = nowIso();
    const folder = {
      id: randomUUID(),
      parent_id: parentId,
      name: String(req.body.name || "新建文件夹").trim() || "新建文件夹",
      sort_index: store.nextSortIndex(meta.folders, parentId),
      created_at: now,
      updated_at: now,
    };
    meta.folders.push(folder);
    store.save(meta);
    res.status(201).json(store.mapFolder(folder));
  });

  router.patch("/folders/:id", (req, res) => {
    const meta = store.load();
    const folder = store.findFolder(meta, req.params.id);
    if (!folder) {
      return res.status(404).json({ error: "folder not found" });
    }
    const hasParent = Object.prototype.hasOwnProperty.call(req.body, "parent_id");
    const nextParentId = hasParent
      ? normalizeFolderId(req.body.parent_id)
      : folder.parent_id ?? null;
    if (!assertFolder(store, meta, nextParentId, res)) {
      return;
    }
    if (store.wouldCreateFolderCycle(meta, folder.id, nextParentId)) {
      return res.status(400).json({ error: "cannot move folder into itself" });
    }
    if (req.body.name !== undefined) {
      folder.name = String(req.body.name).trim() || folder.name;
      folder.updated_at = nowIso();
    }
    folder.parent_id = nextParentId;
    store.save(meta);
    res.json(store.mapFolder(folder));
  });

  router.delete("/folders/:id", (req, res) => {
    const meta = store.load();
    if (!store.findFolder(meta, req.params.id)) {
      return res.status(404).json({ error: "folder not found" });
    }
    const ids = new Set(store.getDescendantFolderIds(meta, req.params.id));
    meta.folders = meta.folders.filter((folder) => !ids.has(folder.id));
    for (const file of meta.files) {
      if (ids.has(file.folder_id)) {
        file.folder_id = null;
      }
    }
    store.save(meta);
    res.json({ ok: true });
  });

  router.post("/move", (req, res) => {
    const meta = store.load();
    const folderId = normalizeFolderId(req.body.folder_id);
    const fileIds = Array.isArray(req.body.file_ids)
      ? req.body.file_ids.filter((id) => typeof id === "string")
      : [];
    if (fileIds.length === 0) {
      return res.status(400).json({ error: "file_ids required" });
    }
    if (!assertFolder(store, meta, folderId, res)) {
      return;
    }
    let sortIndex = store.nextSortIndex(meta.files, folderId);
    for (const file of meta.files) {
      if (fileIds.includes(file.id)) {
        file.folder_id = folderId;
        file.sort_index = sortIndex++;
      }
    }
    store.save(meta);
    res.json({ ok: true });
  });

  router.post("/order", (req, res) => {
    const meta = store.load();
    const parentId = normalizeFolderId(req.body.parent_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!assertFolder(store, meta, parentId, res)) {
      return;
    }
    items.forEach((item, index) => {
      if (!isRecord(item) || typeof item.id !== "string") {
        return;
      }
      if (item.type === "folder") {
        const folder = store.findFolder(meta, item.id);
        if (folder && !store.wouldCreateFolderCycle(meta, folder.id, parentId)) {
          folder.parent_id = parentId;
          folder.sort_index = index;
        }
      }
      if (item.type === "file") {
        const file = store.findFile(meta, item.id);
        if (file) {
          file.folder_id = parentId;
          file.sort_index = index;
        }
      }
    });
    store.save(meta);
    res.json({ ok: true });
  });

  router.get("/", (_req, res) => {
    const meta = store.load();
    res.json(meta.files.map((file) => store.mapFile(file)));
  });

  router.post("/", (req, res) => {
    const meta = store.load();
    const kind = typeof req.body.kind === "string" && req.body.kind.trim()
      ? req.body.kind.trim()
      : "excalidraw";
    const folderId = normalizeFolderId(req.body.folder_id);
    if (!assertFolder(store, meta, folderId, res)) {
      return;
    }
    const now = nowIso();
    const file = {
      id: randomUUID(),
      name: String(req.body.name || "Untitled").trim() || "Untitled",
      kind,
      path: `documents/${randomUUID()}${extensionForKind(kind)}`,
      folder_id: folderId,
      sort_index: store.nextSortIndex(meta.files, folderId),
      created_at: now,
      updated_at: now,
      content_sha256: null,
      archives: [],
    };
    const data = createEmptyData(kind);
    file.content_sha256 = hashJson(data);
    store.writeData(file, data);
    meta.files.push(file);
    store.save(meta);
    logFilesOperation("create-file", {
      id: file.id.slice(0, 8),
      kind: file.kind,
      name: file.name,
      folder_id: file.folder_id,
    });
    res.status(201).json(store.mapFile(file));
  });

  router.get("/:id", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    if (!file) {
      logGetFile(req.params.id, { outcome: "not-found" });
      return res.status(404).json({ error: "not found" });
    }
    if (ifNoneMatchSatisfied(req.get("if-none-match"), file.content_sha256)) {
      logGetFile(req.params.id, { outcome: "not-modified", sha: file.content_sha256?.slice(0, 8) });
      return sendNotModified(res, file.content_sha256);
    }
    let data;
    try {
      data = store.readData(file);
    } catch (error) {
      logDocumentError("get-file", req.params.id, error);
      return sendDocumentReadError(res, error);
    }
    const etag = formatDocumentEtag(file.content_sha256);
    if (etag) {
      res.setHeader("ETag", etag);
    }
    res.setHeader("Cache-Control", "private, no-cache");
    logGetFile(req.params.id, {
      outcome: "ok",
      kind: file.kind,
      sha: file.content_sha256?.slice(0, 8),
      name: file.name,
    });
    res.json({ ...store.mapFile(file), data });
  });

  router.put("/:id", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    if (!file) {
      logPutFile(req.params.id, req.body, { outcome: "not-found" });
      return res.status(404).json({ error: "not found" });
    }
    const hasData = Object.prototype.hasOwnProperty.call(req.body, "data");
    const hasName = typeof req.body.name === "string" && req.body.name.trim();
    const hasThumbnailField = Object.prototype.hasOwnProperty.call(req.body, "thumbnail");
    const hasThumb = typeof req.body.thumbnail === "string" && req.body.thumbnail.length > 0;
    const clearThumb = req.body.thumbnail === null;
    const mutatesThumbnail = hasThumb || clearThumb;
    let contentSha256Out;
    let skipDataWrite = false;

    if (hasData) {
      const docPath = store.documentPath(file);
      if (fs.existsSync(docPath)) {
        try {
          const existingData = JSON.parse(fs.readFileSync(docPath, "utf8"));
          if (hashJson(existingData) === hashJson(req.body.data)) {
            skipDataWrite = true;
          }
        } catch {
          // fall through to normal save
        }
      }
      contentSha256Out = hashJson(req.body.data);
    }

    if (skipDataWrite && !hasName && !mutatesThumbnail) {
      logPutFile(req.params.id, req.body, {
        outcome: "skipped",
        sha: contentSha256Out?.slice(0, 8),
        updated_at: file.updated_at,
      });
      return res.json({
        ok: true,
        skipped: true,
        ...(contentSha256Out !== undefined && { content_sha256: contentSha256Out }),
        updated_at: file.updated_at,
      });
    }

    const now = nowIso();

    if (hasData && !skipDataWrite) {
      store.writeData(file, req.body.data);
      store.appendArchive(file, req.body.data, normalizeArchiveLabel(req.body.archiveLabel));
      file.content_sha256 = contentSha256Out;
    }

    if (hasThumb) {
      fs.writeFileSync(store.thumbnailPath(file.id), req.body.thumbnail, "utf8");
    } else if (clearThumb) {
      fs.rmSync(store.thumbnailPath(file.id), { force: true });
      fs.rmSync(store.thumbnailMetaPath(file.id), { force: true });
    }

    if (hasName) {
      file.name = String(req.body.name).trim();
    }

    if (!skipDataWrite || hasName || hasThumbnailField) {
      file.updated_at = now;
    }

    if (hasThumb && contentSha256Out) {
      fs.writeFileSync(
        store.thumbnailMetaPath(file.id),
        JSON.stringify({
          content_sha256: contentSha256Out,
          updated_at: file.updated_at,
          thumbnail_source: "client_svg_upload",
        }),
        "utf8",
      );
    }

    store.save(meta);
    logPutFile(req.params.id, req.body, {
      outcome: "saved",
      skipDataWrite,
      wroteThumb: hasThumb,
      clearedThumb: clearThumb,
      sha: contentSha256Out?.slice(0, 8),
      updated_at: file.updated_at,
    });
    res.json({
      ok: true,
      updated_at: file.updated_at,
      ...(contentSha256Out !== undefined && { content_sha256: contentSha256Out }),
    });
  });

  router.get("/:id/thumbnail", (req, res) => {
    const thumb = store.thumbnailPath(req.params.id);
    if (!fs.existsSync(thumb)) {
      return res.status(404).json({ error: "no thumbnail" });
    }
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader(
      "Cache-Control",
      req.query.h ? "public, max-age=31536000, immutable" : "public, max-age=300",
    );
    res.send(fs.readFileSync(thumb, "utf8"));
  });

  router.patch("/:id", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    if (!file) {
      return res.status(404).json({ error: "not found" });
    }
    if (req.body.name !== undefined) {
      file.name = String(req.body.name).trim() || file.name;
      file.updated_at = nowIso();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "folder_id")) {
      const folderId = normalizeFolderId(req.body.folder_id);
      if (!assertFolder(store, meta, folderId, res)) {
        return;
      }
      file.folder_id = folderId;
      file.sort_index = store.nextSortIndex(meta.files, folderId);
      file.updated_at = nowIso();
    }
    store.save(meta);
    res.json({ ok: true, ...store.mapFile(file) });
  });

  router.delete("/:id", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    if (!file) {
      return res.status(404).json({ error: "not found" });
    }
    fs.rmSync(store.documentPath(file), { force: true });
    fs.rmSync(store.thumbnailPath(file.id), { force: true });
    fs.rmSync(store.thumbnailMetaPath(file.id), { force: true });
    fs.rmSync(store.archiveDir(file.id), { recursive: true, force: true });
    meta.files = meta.files.filter((item) => item.id !== file.id);
    store.save(meta);
    res.json({ ok: true });
  });

  router.post("/:id/archive", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    if (!file) {
      return res.status(404).json({ error: "not found" });
    }
    let data;
    try {
      data = store.readData(file);
    } catch (error) {
      return sendDocumentReadError(res, error);
    }
    const payload = req.body.deltas ? { ...data, _deltas: req.body.deltas } : data;
    const archive = store.appendArchive(file, payload, normalizeArchiveLabel(req.body.label));
    store.save(meta);
    res.status(201).json(archive);
  });

  router.get("/:id/archives", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    if (!file) {
      return res.status(404).json({ error: "not found" });
    }
    res.json([...(file.archives ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
  });

  router.patch("/:id/archives/:archiveId", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    const archive = file?.archives?.find((item) => item.id === req.params.archiveId);
    if (!file || !archive) {
      return res.status(404).json({ error: "archive not found" });
    }
    if (req.body.label !== undefined) {
      archive.label = normalizeArchiveLabel(req.body.label);
    }
    store.save(meta);
    res.json({ ok: true, ...archive });
  });

  router.get("/:id/archives/:archiveId", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    const archive = file?.archives?.find((item) => item.id === req.params.archiveId);
    if (!file || !archive) {
      return res.status(404).json({ error: "archive not found" });
    }
    let data;
    try {
      data = store.readArchiveData(file.id, archive.id);
    } catch (error) {
      return sendDocumentReadError(res, error);
    }
    res.json({
      ...archive,
      data,
    });
  });

  router.post("/:id/restore/:archiveId", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    const archive = file?.archives?.find((item) => item.id === req.params.archiveId);
    if (!file || !archive) {
      return res.status(404).json({ error: "archive not found" });
    }
    let data;
    try {
      data = store.readArchiveData(file.id, archive.id);
    } catch (error) {
      return sendDocumentReadError(res, error);
    }
    delete data._deltas;
    file.content_sha256 = hashJson(data);
    file.updated_at = nowIso();
    store.writeData(file, data);
    store.save(meta);
    res.json({ ok: true, restored_from: archive.id, content_sha256: file.content_sha256 });
  });

  router.delete("/:id/archives/:archiveId", (req, res) => {
    const meta = store.load();
    const file = store.findFile(meta, req.params.id);
    const archive = file?.archives?.find((item) => item.id === req.params.archiveId);
    if (!file || !archive) {
      return res.status(404).json({ error: "archive not found" });
    }
    fs.rmSync(store.archivePath(file.id, archive.id), { force: true });
    file.archives = file.archives.filter((item) => item.id !== archive.id);
    store.save(meta);
    res.json({ ok: true });
  });

  return router;
}
