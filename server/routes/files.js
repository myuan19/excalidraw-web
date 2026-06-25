import { Router } from "express";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import db, { DATA_DIR } from "../db.js";
import { createLogger } from "../lib/logger.js";
import {
  formatDocumentEtag,
  ifMatchAllowsWrite,
  ifNoneMatchSatisfied,
  sendNotModified,
} from "../lib/documentEtag.js";
import {
  isApiDebugEnabled,
  isThumbAuditLogEnabled,
  summarizeScenePayload,
  truncStr,
} from "../logger.js";

const router = Router();

const log = createLogger({ module: "files" });
const thumbAuditLog = createLogger({ module: "thumb-send" });

function fileDir(fileId) {
  return join(DATA_DIR, "files", fileId);
}

function currentPath(fileId) {
  return join(fileDir(fileId), "current.excalidraw");
}

function archivePath(fileId, archiveId) {
  const dir = join(fileDir(fileId), "archives");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${archiveId}.excalidraw`);
}

function thumbnailPath(fileId) {
  return join(fileDir(fileId), "thumbnail.svg");
}

function thumbnailMetaPath(fileId) {
  return join(fileDir(fileId), "thumbnail.meta.json");
}

function hashSceneDataJson(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/** 每次成功保存后追加一条版本快照（与 current.excalidraw 内容一致） */
/** 每个文件最多保留的版本快照条数（更早的从 DB 与磁盘删除） */
const MAX_ARCHIVES_PER_FILE = 8;
const AUTO_ARCHIVE_LABEL_PREFIX = "auto:";
const FILE_VERSION_MAX = 2_147_483_647;
const CHECKPOINT_LABELS = {
  manual: "checkpoint:manual",
  interval: "checkpoint:interval",
  restoreBackup: "checkpoint:restore-backup",
};

function normalizeArchiveLabel(value) {
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}

function isAutoArchiveLabel(label) {
  return (
    typeof label === "string" && label.startsWith(AUTO_ARCHIVE_LABEL_PREFIX)
  );
}

function currentFileVersion(version) {
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

function nextFileVersion(version) {
  const current = currentFileVersion(version);
  return current >= FILE_VERSION_MAX ? 0 : current + 1;
}

function normalizeExpectedVersion(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= FILE_VERSION_MAX ? n : null;
}

function normalizeCheckpointPolicy(value) {
  if (!value || typeof value !== "object") {
    return { mode: "none" };
  }
  if (value.mode === "force") {
    return {
      mode: "force",
      label: normalizeArchiveLabel(value.label) || CHECKPOINT_LABELS.manual,
    };
  }
  if (value.mode === "interval") {
    const intervalMinutes = Number(value.intervalMinutes);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      return { mode: "none" };
    }
    return {
      mode: "interval",
      intervalMinutes,
      label: normalizeArchiveLabel(value.label) || CHECKPOINT_LABELS.interval,
    };
  }
  return { mode: "none" };
}

function deleteArchiveRow(row) {
  if (!row) {
    return;
  }
  const absPath = join(DATA_DIR, row.path);
  if (existsSync(absPath)) {
    try {
      rmSync(absPath);
    } catch {
      // ignore
    }
  }
  db.prepare("DELETE FROM archives WHERE id = ?").run(row.id);
}

function deleteArchivesByLabel(fileId, label) {
  if (!label) {
    return;
  }
  const rows = db
    .prepare("SELECT id, path FROM archives WHERE file_id = ? AND label = ?")
    .all(fileId, label);
  rows.forEach(deleteArchiveRow);
}

function mapArchiveRow(row) {
  return {
    id: row.id,
    label: row.label,
    created_at: row.created_at,
    content_sha256: row.content_sha256 ?? null,
  };
}

function getLatestArchiveRow(fileId) {
  return db
    .prepare(
      `SELECT id, label, created_at, content_sha256
       FROM archives
       WHERE file_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(fileId);
}

function findArchiveBySha(fileId, contentSha256) {
  if (!contentSha256) {
    return null;
  }
  return (
    db
      .prepare(
        `SELECT id, label, created_at, content_sha256
         FROM archives
         WHERE file_id = ? AND content_sha256 = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(fileId, contentSha256) ?? null
  );
}

function hasArchiveWithSha(fileId, contentSha256) {
  return !!findArchiveBySha(fileId, contentSha256);
}

function shouldDedupeCheckpointLabel(label) {
  return label !== CHECKPOINT_LABELS.manual;
}

function normalizeFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nextSortIndex(table, parentColumn, parentId) {
  const where =
    parentId == null ? `${parentColumn} IS NULL` : `${parentColumn} = ?`;
  const row =
    parentId == null
      ? db
          .prepare(
            `SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM ${table} WHERE ${where}`,
          )
          .get()
      : db
          .prepare(
            `SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM ${table} WHERE ${where}`,
          )
          .get(parentId);
  return row?.next ?? 0;
}

function folderExists(folderId) {
  if (folderId == null) {
    return true;
  }
  return !!db.prepare("SELECT id FROM file_folders WHERE id = ?").get(folderId);
}

function assertFolderExists(folderId, res) {
  if (!folderExists(folderId)) {
    res.status(404).json({ error: "folder not found" });
    return false;
  }
  return true;
}

function mapFileRow(r) {
  return {
    ...r,
    kind: r.kind || "excalidraw",
    folder_id: r.folder_id ?? null,
    sort_index: r.sort_index ?? 0,
    version: currentFileVersion(r.version),
    has_thumbnail: existsSync(thumbnailPath(r.id)),
    content_sha256: r.content_sha256 ?? null,
  };
}

function mapFolderRow(r) {
  return {
    id: r.id,
    parent_id: r.parent_id ?? null,
    name: r.name,
    sort_index: r.sort_index ?? 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function getDescendantFolderIds(folderId) {
  const ids = [];
  const queue = [folderId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    ids.push(id);
    const children = db
      .prepare("SELECT id FROM file_folders WHERE parent_id = ?")
      .all(id);
    for (const child of children) {
      queue.push(child.id);
    }
  }
  return ids;
}

function wouldCreateFolderCycle(folderId, nextParentId) {
  if (nextParentId == null) {
    return false;
  }
  if (folderId === nextParentId) {
    return true;
  }
  let cursor = nextParentId;
  while (cursor) {
    const row = db
      .prepare("SELECT parent_id FROM file_folders WHERE id = ?")
      .get(cursor);
    if (!row) {
      return false;
    }
    cursor = row.parent_id;
    if (cursor === folderId) {
      return true;
    }
  }
  return false;
}

/** 在插入新快照之前腾出位置：优先淘汰自动保存，其次才删最旧版本。 */
function trimArchivesBeforeAppend(fileId) {
  for (;;) {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS c FROM archives WHERE file_id = ?`)
      .get(fileId);
    const n = countRow?.c ?? 0;
    if (n < MAX_ARCHIVES_PER_FILE) {
      return;
    }
    const row = db
      .prepare(
        `SELECT id, path FROM archives
         WHERE file_id = ?
         ORDER BY
           CASE WHEN label LIKE 'auto:%' THEN 0 ELSE 1 END,
           CASE WHEN label = 'checkpoint:interval' THEN 0 ELSE 1 END,
           created_at ASC
         LIMIT 1`,
      )
      .get(fileId);
    if (!row) {
      return;
    }
    deleteArchiveRow(row);
  }
}

function appendVersionSnapshot(fileId, dataObj, options = {}) {
  const label = normalizeArchiveLabel(options.label);
  if (isAutoArchiveLabel(label)) {
    deleteArchivesByLabel(fileId, label);
  }
  trimArchivesBeforeAppend(fileId);
  const archiveId = randomUUID();
  const now = new Date().toISOString();
  const relPath = `files/${fileId}/archives/${archiveId}.excalidraw`;
  const absPath = archivePath(fileId, archiveId);
  const jsonStr = JSON.stringify(dataObj);
  const parsedForHash = { ...dataObj };
  delete parsedForHash._deltas;
  const sha = hashSceneDataJson(parsedForHash);
  writeFileSync(absPath, jsonStr, "utf-8");
  db.prepare(
    `INSERT INTO archives (id, file_id, label, created_at, path, content_sha256) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(archiveId, fileId, label, now, relPath, sha);
  return { id: archiveId, label, created_at: now, content_sha256: sha };
}

function shouldCreateCheckpoint(fileId, contentSha256, policy) {
  if (!policy || policy.mode === "none") {
    return false;
  }
  const label = normalizeArchiveLabel(policy.label) || CHECKPOINT_LABELS.manual;
  if (
    shouldDedupeCheckpointLabel(label) &&
    hasArchiveWithSha(fileId, contentSha256)
  ) {
    return false;
  }
  if (policy.mode === "force") {
    return true;
  }
  if (policy.mode !== "interval") {
    return false;
  }
  const latest = getLatestArchiveRow(fileId);
  if (!latest) {
    return true;
  }
  const latestAt = Date.parse(latest.created_at);
  if (!Number.isFinite(latestAt)) {
    return true;
  }
  return Date.now() - latestAt >= policy.intervalMinutes * 60 * 1000;
}

function maybeAppendCheckpoint(fileId, dataObj, contentSha256, policy) {
  if (!shouldCreateCheckpoint(fileId, contentSha256, policy)) {
    return { created: false };
  }
  const entry = appendVersionSnapshot(fileId, dataObj, { label: policy.label });
  return { created: true, ...entry };
}

function ensureFileDir(fileId) {
  const dir = fileDir(fileId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---------- backfill content_sha256 for existing files ----------
{
  const rows = db
    .prepare(`SELECT id FROM files WHERE content_sha256 IS NULL`)
    .all();
  for (const r of rows) {
    const fp = currentPath(r.id);
    if (existsSync(fp)) {
      try {
        const data = JSON.parse(readFileSync(fp, "utf-8"));
        const sha = hashSceneDataJson(data);
        db.prepare("UPDATE files SET content_sha256 = ? WHERE id = ?").run(
          sha,
          r.id,
        );
      } catch {
        /* skip corrupt files */
      }
    }
  }
  if (rows.length) {
    console.log(
      `[excalidraw-web-server] backfilled content_sha256 for ${rows.length} file(s)`,
    );
  }
}

// ---------- files CRUD ----------

router.get("/hashes", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, content_sha256, version FROM files ORDER BY updated_at DESC`,
    )
    .all();
  res.json(rows);
});

router.get("/tree", (_req, res) => {
  const t0 = Date.now();
  const folders = db
    .prepare(
      `SELECT id, parent_id, name, sort_index, created_at, updated_at
       FROM file_folders
       ORDER BY parent_id IS NOT NULL, parent_id ASC, sort_index ASC, name COLLATE NOCASE ASC`,
    )
    .all()
    .map(mapFolderRow);
  const files = db
    .prepare(
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.content_sha256, f.version, f.folder_id, f.sort_index,
              f.kind,
              (SELECT count(*) FROM archives a WHERE a.file_id = f.id) AS archive_count
       FROM files f
       ORDER BY f.folder_id IS NOT NULL, f.folder_id ASC, f.sort_index ASC, f.updated_at DESC`,
    )
    .all()
    .map(mapFileRow);
  const withThumb = files.filter((f) => f.has_thumbnail).length;
  log.info("GET /tree", {
    ms: Date.now() - t0,
    folders: folders.length,
    files: files.length,
    withThumbnail: withThumb,
  });
  res.json({ folders, files });
});

router.post("/folders", (req, res) => {
  const id = randomUUID();
  const name = String(req.body.name || "新建文件夹").trim() || "新建文件夹";
  const parentId = normalizeFolderId(req.body.parent_id);
  if (!assertFolderExists(parentId, res)) {
    return;
  }
  const now = new Date().toISOString();
  const sortIndex = Number.isFinite(Number(req.body.sort_index))
    ? Number(req.body.sort_index)
    : nextSortIndex("file_folders", "parent_id", parentId);
  db.prepare(
    `INSERT INTO file_folders (id, parent_id, name, sort_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, parentId, name, sortIndex, now, now);
  res.status(201).json({
    id,
    parent_id: parentId,
    name,
    sort_index: sortIndex,
    created_at: now,
    updated_at: now,
  });
});

router.patch("/folders/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM file_folders WHERE id = ?")
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "folder not found" });
  }
  const nextName =
    req.body.name !== undefined
      ? String(req.body.name).trim() || row.name
      : row.name;
  const hasParent = Object.prototype.hasOwnProperty.call(req.body, "parent_id");
  const nextParentId = hasParent
    ? normalizeFolderId(req.body.parent_id)
    : row.parent_id;
  if (!assertFolderExists(nextParentId, res)) {
    return;
  }
  if (wouldCreateFolderCycle(req.params.id, nextParentId)) {
    return res.status(400).json({ error: "cannot move folder into itself" });
  }
  const nameChanged =
    Object.prototype.hasOwnProperty.call(req.body, "name") &&
    nextName !== row.name;
  if (nameChanged) {
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE file_folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?",
    ).run(nextName, nextParentId, now, req.params.id);
  } else {
    // 仅改 parent（拖拽移动）：不触发展示用的「修改时间」
    db.prepare(
      "UPDATE file_folders SET name = ?, parent_id = ? WHERE id = ?",
    ).run(nextName, nextParentId, req.params.id);
  }
  const updated = db
    .prepare(
      "SELECT id, parent_id, name, sort_index, created_at, updated_at FROM file_folders WHERE id = ?",
    )
    .get(req.params.id);
  res.json(mapFolderRow(updated));
});

router.delete("/folders/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM file_folders WHERE id = ?")
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "folder not found" });
  }
  const folderIds = getDescendantFolderIds(req.params.id);
  const deleteTxn = db.transaction(() => {
    for (const folderId of folderIds) {
      db.prepare("UPDATE files SET folder_id = NULL WHERE folder_id = ?").run(
        folderId,
      );
    }
    db.prepare("DELETE FROM file_folders WHERE id = ?").run(req.params.id);
  });
  deleteTxn();
  res.json({ ok: true });
});

router.post("/move", (req, res) => {
  const fileIds = Array.isArray(req.body.file_ids)
    ? req.body.file_ids.filter((id) => typeof id === "string" && id)
    : [];
  const folderId = normalizeFolderId(req.body.folder_id);
  if (fileIds.length === 0) {
    return res.status(400).json({ error: "file_ids required" });
  }
  if (!assertFolderExists(folderId, res)) {
    return;
  }
  const moveTxn = db.transaction(() => {
    // Do not touch updated_at: pure folder moves should not change "modified" time
    // (user expectation; same as reorder-only updates in /order for files).
    const update = db.prepare(
      "UPDATE files SET folder_id = ?, sort_index = ? WHERE id = ?",
    );
    let sortIndex = nextSortIndex("files", "folder_id", folderId);
    for (const fileId of fileIds) {
      update.run(folderId, sortIndex++, fileId);
    }
  });
  moveTxn();
  res.json({ ok: true });
});

router.post("/order", (req, res) => {
  const parentId = normalizeFolderId(req.body.parent_id);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!assertFolderExists(parentId, res)) {
    return;
  }
  const orderTxn = db.transaction(() => {
    const updateFile = db.prepare(
      "UPDATE files SET folder_id = ?, sort_index = ? WHERE id = ?",
    );
    const updateFolder = db.prepare(
      "UPDATE file_folders SET parent_id = ?, sort_index = ? WHERE id = ?",
    );
    items.forEach((item, index) => {
      if (!item || typeof item.id !== "string") {
        return;
      }
      if (item.type === "folder") {
        if (!wouldCreateFolderCycle(item.id, parentId)) {
          updateFolder.run(parentId, index, item.id);
        }
        return;
      }
      if (item.type === "file") {
        updateFile.run(parentId, index, item.id);
      }
    });
  });
  orderTxn();
  res.json({ ok: true });
});

router.get("/", (_req, res) => {
  log.debug("GET /api/files list");
  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.content_sha256, f.version, f.folder_id, f.sort_index,
              f.kind,
              (SELECT count(*) FROM archives a WHERE a.file_id = f.id) AS archive_count
       FROM files f ORDER BY f.updated_at DESC`,
    )
    .all();
  const result = rows.map(mapFileRow);
  res.json(result);
});

router.post("/", (req, res) => {
  const id = randomUUID();
  const name = req.body.name || "Untitled";
  const kind =
    typeof req.body.kind === "string" && req.body.kind.trim()
      ? req.body.kind.trim()
      : "excalidraw";
  const folderId = normalizeFolderId(req.body.folder_id);
  if (!assertFolderExists(folderId, res)) {
    return;
  }
  const now = new Date().toISOString();
  log.info("POST / create file (随后导入会 PUT 场景)", {
    id: id.slice(0, 8),
    name: truncStr(String(name), 120),
    kind,
    folder_id: folderId,
  });

  const sortIndex = nextSortIndex("files", "folder_id", folderId);
  db.prepare(
    "INSERT INTO files (id, name, kind, created_at, updated_at, folder_id, sort_index) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, name, kind, now, now, folderId, sortIndex);

  ensureFileDir(id);
  const empty = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "excalidraw-local",
    elements: [],
    appState: {},
    files: {},
  });
  writeFileSync(currentPath(id), empty, "utf-8");

  res.status(201).json({
    id,
    name,
    kind,
    created_at: now,
    updated_at: now,
    folder_id: folderId,
    sort_index: sortIndex,
    version: 0,
  });
});

router.get("/:id", (req, res) => {
  const startedAt = Date.now();
  const fid = req.params.id;
  const dbStartedAt = Date.now();
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(fid);
  const dbMs = Date.now() - dbStartedAt;
  if (!row) {
    if (isApiDebugEnabled()) {
      log.info("[DEBUG] files.getById | not found", {
        id: fid.slice(0, 8),
        dbMs,
        totalMs: Date.now() - startedAt,
      });
    }
    log.warn("GET /:id not found", { id: fid.slice(0, 8) });
    return res.status(404).json({ error: "not found" });
  }

  const fp = currentPath(fid);
  if (!existsSync(fp)) {
    if (isApiDebugEnabled()) {
      log.info("[DEBUG] files.getById | disk missing", {
        id: fid.slice(0, 8),
        dbMs,
        totalMs: Date.now() - startedAt,
        path: fp,
      });
    }
    log.warn("GET /:id disk missing", { id: fid.slice(0, 8), path: fp });
    return res.status(404).json({ error: "file data missing" });
  }

  if (
    row.content_sha256 &&
    ifNoneMatchSatisfied(req.get("if-none-match"), row.content_sha256)
  ) {
    return sendNotModified(res, row.content_sha256);
  }

  let data;
  let raw = "";
  let readMs = 0;
  let parseMs = 0;
  try {
    const readStartedAt = Date.now();
    raw = readFileSync(fp, "utf-8");
    readMs = Date.now() - readStartedAt;
    const parseStartedAt = Date.now();
    data = JSON.parse(raw);
    parseMs = Date.now() - parseStartedAt;
  } catch (e) {
    if (isApiDebugEnabled()) {
      log.info("[DEBUG] files.getById | JSON.parse failed", {
        id: fid.slice(0, 8),
        dbMs,
        readMs,
        parseMs,
        bytes: Buffer.byteLength(raw || "", "utf-8"),
        totalMs: Date.now() - startedAt,
        message: e.message,
      });
    }
    log.error("GET /:id JSON.parse failed", {
      id: fid.slice(0, 8),
      message: e.message,
    });
    return res
      .status(500)
      .json({ error: "corrupt scene file", message: e.message });
  }
  if (isApiDebugEnabled()) {
    log.info("[DEBUG] files.getById | success", {
      id: fid.slice(0, 8),
      dbMs,
      readMs,
      parseMs,
      bytes: Buffer.byteLength(raw, "utf-8"),
      totalMs: Date.now() - startedAt,
      kind: row.kind,
    });
  }
  const etag = formatDocumentEtag(row.content_sha256);
  if (etag) {
    res.setHeader("ETag", etag);
  }
  res.setHeader("Cache-Control", "private, no-cache");
  res.json({ ...mapFileRow(row), data });
});

router.put("/:id", (req, res) => {
  const id = req.params.id;
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "not found" });

  const hasData = !!req.body.data;
  const hasThumbnailField = Object.prototype.hasOwnProperty.call(
    req.body,
    "thumbnail",
  );
  const hasThumb =
    typeof req.body.thumbnail === "string" && req.body.thumbnail.length > 0;
  const clearThumb = req.body.thumbnail === null;
  const mutatesThumbnail = hasThumb || clearThumb;
  const incomingName =
    typeof req.body.name === "string" && req.body.name ? req.body.name : null;
  const hasName = incomingName !== null;
  const nameChanged = hasName && incomingName !== row.name;
  const forceOverwrite = req.body.forceOverwrite === true;
  const expectedVersion = normalizeExpectedVersion(req.body.expectedVersion);
  const archiveLabel = normalizeArchiveLabel(req.body.archiveLabel);
  const checkpointPolicy = normalizeCheckpointPolicy(req.body.checkpointPolicy);
  const elementCount =
    hasData && Array.isArray(req.body.data?.elements)
      ? req.body.data.elements.length
      : 0;
  const fileCount =
    hasData && req.body.data?.files
      ? Object.keys(req.body.data.files).length
      : 0;
  const sceneSummary = hasData ? summarizeScenePayload(req.body.data) : null;
  const incomingSha = hasData ? hashSceneDataJson(req.body.data) : null;
  log.info("PUT /:id (导入会走：创建 → archives 检查 → 本请求)", {
    id: id.slice(0, 8),
    contentLength: req.headers["content-length"] ?? null,
    bodyKeys: Object.keys(req.body || {}),
    hasData,
    hasName,
    forceOverwrite,
    expectedVersion,
    currentVersion: currentFileVersion(row.version),
    name:
      req.body.name != null
        ? truncStr(String(req.body.name), 80)
        : "(unchanged)",
    archiveLabel: archiveLabel || "",
    checkpointPolicy: checkpointPolicy.mode,
    checkpointIntervalMinutes:
      checkpointPolicy.mode === "interval"
        ? checkpointPolicy.intervalMinutes
        : null,
    hasThumbnailField,
    hasThumb,
    clearThumb,
    thumbLen: hasThumb ? req.body.thumbnail.length : 0,
    elementCount,
    fileCount,
    sceneSummary,
    incomingSha: incomingSha?.slice(0, 8) ?? null,
  });

  if (
    hasData &&
    !forceOverwrite &&
    (expectedVersion === null ||
      expectedVersion !== currentFileVersion(row.version))
  ) {
    log.warn("PUT /:id → VERSION CONFLICT", {
      id: id.slice(0, 8),
      expectedVersion,
      currentVersion: currentFileVersion(row.version),
      currentSha: row.content_sha256?.slice(0, 8) ?? null,
      incomingSha: incomingSha?.slice(0, 8) ?? null,
    });
    return res.status(409).json({
      error: "version_conflict",
      message: "file has been updated on the server",
      version: currentFileVersion(row.version),
      content_sha256: row.content_sha256 ?? null,
      updated_at: row.updated_at,
    });
  }

  /** 与磁盘上当前文件内容一致则跳过数据写入与版本记录（仍允许仅改文件名或缩略图） */
  let skipDataWrite = false;
  if (hasData) {
    const fp = currentPath(id);
    if (existsSync(fp)) {
      try {
        const existingData = JSON.parse(readFileSync(fp, "utf-8"));
        if (hashSceneDataJson(existingData) === incomingSha) {
          skipDataWrite = true;
        }
      } catch {
        // fall through to normal save
      }
    }
  }

  if (skipDataWrite && !nameChanged && !mutatesThumbnail) {
    const sha = hasData ? hashSceneDataJson(req.body.data) : undefined;
    const checkpoint =
      hasData && sha
        ? maybeAppendCheckpoint(id, req.body.data, sha, checkpointPolicy)
        : { created: false };
    log.info("PUT /:id → SKIPPED (unchanged)", {
      id: id.slice(0, 8),
      sha: sha?.slice(0, 8),
      checkpointCreated: checkpoint.created,
    });
    return res.json({
      ok: true,
      skipped: true,
      ...(sha !== undefined && { content_sha256: sha }),
      version: currentFileVersion(row.version),
      checkpoint,
      updated_at: row.updated_at,
    });
  }

  const carriesDocumentCheckpointIntent =
    checkpointPolicy.mode !== "none" || !!archiveLabel;
  const thumbnailOnlyWrite =
    mutatesThumbnail &&
    !nameChanged &&
    !carriesDocumentCheckpointIntent &&
    (!hasData || skipDataWrite);
  if (thumbnailOnlyWrite) {
    const thumbnailUpdatedAt = new Date().toISOString();
    let thumbnailWriteSummary = null;
    if (hasThumb) {
      ensureFileDir(id);
      const tp = thumbnailPath(id);
      writeFileSync(tp, req.body.thumbnail, "utf-8");
      thumbnailWriteSummary = {
        pathKind: "thumbnail.svg",
        bytes: Buffer.byteLength(req.body.thumbnail, "utf-8"),
        head: truncStr(req.body.thumbnail.trim().slice(0, 160), 160),
      };
      if (row.content_sha256) {
        writeFileSync(
          thumbnailMetaPath(id),
          JSON.stringify({
            content_sha256: row.content_sha256,
            updated_at: thumbnailUpdatedAt,
            thumbnail_source: "client_svg_upload",
          }),
          "utf-8",
        );
      }
      log.info("PUT /:id → THUMBNAIL WRITTEN (sidecar only)", {
        id: id.slice(0, 8),
        thumbnailWriteSummary,
        contentSha: row.content_sha256?.slice(0, 8) ?? null,
        version: currentFileVersion(row.version),
      });
    } else if (clearThumb) {
      const thumbFile = thumbnailPath(id);
      const metaFile = thumbnailMetaPath(id);
      if (existsSync(thumbFile)) {
        rmSync(thumbFile, { force: true });
      }
      if (existsSync(metaFile)) {
        rmSync(metaFile, { force: true });
      }
      log.info("PUT /:id → THUMBNAIL CLEARED (sidecar only)", {
        id: id.slice(0, 8),
        contentSha: row.content_sha256?.slice(0, 8) ?? null,
        version: currentFileVersion(row.version),
      });
    }
    return res.json({
      ok: true,
      skipped: !!hasData,
      content_sha256: row.content_sha256 ?? null,
      version: currentFileVersion(row.version),
      updated_at: row.updated_at,
    });
  }

  const now = new Date().toISOString();
  const nextVersion =
    hasData && !skipDataWrite
      ? nextFileVersion(row.version)
      : currentFileVersion(row.version);

  if (
    hasData &&
    !skipDataWrite &&
    req.get("if-match") &&
    !ifMatchAllowsWrite(req.get("if-match"), row.content_sha256)
  ) {
    log.info("PUT /:id → CONFLICT (If-Match)", {
      id: id.slice(0, 8),
      currentSha: row.content_sha256?.slice(0, 8) ?? null,
    });
    return res.status(412).json({
      error: "content conflict",
      content_sha256: row.content_sha256 ?? null,
    });
  }

  let checkpoint = { created: false };
  let dataWriteSummary = null;
  if (req.body.data && !skipDataWrite) {
    ensureFileDir(id);
    const fp = currentPath(id);
    writeFileSync(fp, JSON.stringify(req.body.data), "utf-8");
    try {
      const persistedRaw = readFileSync(fp, "utf-8");
      const persistedData = JSON.parse(persistedRaw);
      dataWriteSummary = {
        pathKind: "current.excalidraw",
        bytes: Buffer.byteLength(persistedRaw, "utf-8"),
        sha: hashSceneDataJson(persistedData),
        sceneSummary: summarizeScenePayload(persistedData),
      };
      log.info("PUT /:id → DATA WRITTEN (actual disk snapshot)", {
        id: id.slice(0, 8),
        dataWriteSummary,
      });
    } catch (err) {
      log.warn("PUT /:id → DATA WRITTEN but snapshot read failed", {
        id: id.slice(0, 8),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let thumbnailWriteSummary = null;
  if (req.body.thumbnail) {
    ensureFileDir(id);
    const tp = thumbnailPath(id);
    writeFileSync(tp, req.body.thumbnail, "utf-8");
    thumbnailWriteSummary = {
      pathKind: "thumbnail.svg",
      bytes: Buffer.byteLength(req.body.thumbnail, "utf-8"),
      head: truncStr(req.body.thumbnail.trim().slice(0, 160), 160),
    };
    log.info("PUT /:id → THUMBNAIL WRITTEN (actual disk snapshot)", {
      id: id.slice(0, 8),
      thumbnailWriteSummary,
    });
  } else if (clearThumb) {
    const thumbFile = thumbnailPath(id);
    const metaFile = thumbnailMetaPath(id);
    if (existsSync(thumbFile)) {
      rmSync(thumbFile, { force: true });
    }
    if (existsSync(metaFile)) {
      rmSync(metaFile, { force: true });
    }
  }

  let contentSha256Out;
  if (hasData) {
    const src = skipDataWrite
      ? JSON.parse(readFileSync(currentPath(id), "utf-8"))
      : req.body.data;
    contentSha256Out = hashSceneDataJson(src);
    checkpoint = maybeAppendCheckpoint(
      id,
      src,
      contentSha256Out,
      checkpointPolicy,
    );
    if (!checkpoint.created && archiveLabel) {
      const entry = appendVersionSnapshot(id, src, { label: archiveLabel });
      checkpoint = { created: true, ...entry };
    }
  }

  if (hasThumb && contentSha256Out) {
    writeFileSync(
      thumbnailMetaPath(id),
      JSON.stringify({
        content_sha256: contentSha256Out,
        updated_at: now,
        thumbnail_source: "client_svg_upload",
      }),
      "utf-8",
    );
  }

  if (nameChanged) {
    db.prepare(
      "UPDATE files SET name = ?, updated_at = ?, content_sha256 = COALESCE(?, content_sha256), version = ? WHERE id = ?",
    ).run(incomingName, now, contentSha256Out ?? null, nextVersion, id);
  } else {
    db.prepare(
      "UPDATE files SET updated_at = ?, content_sha256 = COALESCE(?, content_sha256), version = ? WHERE id = ?",
    ).run(now, contentSha256Out ?? null, nextVersion, id);
  }

  log.info("PUT /:id → SAVED", {
    id: id.slice(0, 8),
    skipDataWrite,
    wroteThumb: hasThumb,
    clearedThumb: clearThumb,
    sha: contentSha256Out?.slice(0, 8) ?? "none",
    previousVersion: currentFileVersion(row.version),
    nextVersion,
    wroteData: !!(req.body.data && !skipDataWrite),
    archiveLabel: archiveLabel || "",
    checkpointCreated: checkpoint.created,
    dataWriteSummary,
    thumbnailWriteSummary,
  });
  res.json({
    ok: true,
    updated_at: now,
    ...(contentSha256Out !== undefined && { content_sha256: contentSha256Out }),
    version: nextVersion,
    checkpoint,
  });
});

router.get("/:id/thumbnail", (req, res) => {
  const fid = req.params.id;
  const tp = thumbnailPath(fid);
  if (!existsSync(tp)) {
    log.warn("GET /:id/thumbnail 404 (no file on disk)", {
      id: fid.slice(0, 8),
    });
    return res.status(404).json({ error: "no thumbnail" });
  }
  const svg = readFileSync(tp, "utf-8");
  if (svg.trim().length < 80) {
    log.warn("thumbnail file very small (check client export)", {
      id: fid.slice(0, 8),
      bytes: svg.length,
      head: truncStr(svg.trim().slice(0, 160), 160),
    });
  }
  if (isThumbAuditLogEnabled()) {
    thumbAuditLog.info(`GET thumbnail → 200 bytes=${svg.length}`, {
      id: truncStr(fid, 48),
      id8: fid.slice(0, 8),
      immutableHit: !!req.query.h,
    });
  }
  if (isApiDebugEnabled()) {
    log.info("GET /:id/thumbnail OK (debug)", {
      id: fid.slice(0, 8),
      bytes: svg.length,
      cacheHit: !!req.query.h,
    });
  }
  res.setHeader("Content-Type", "image/svg+xml");
  if (req.query.h) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
  res.send(svg);
});

router.patch("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "not found" });
  }
  const now = new Date().toISOString();
  if (req.body.name !== undefined) {
    db.prepare("UPDATE files SET name = ?, updated_at = ? WHERE id = ?").run(
      req.body.name,
      now,
      req.params.id,
    );
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "folder_id")) {
    const folderId = normalizeFolderId(req.body.folder_id);
    if (!assertFolderExists(folderId, res)) {
      return;
    }
    const sortIndex = nextSortIndex("files", "folder_id", folderId);
    db.prepare(
      "UPDATE files SET folder_id = ?, sort_index = ?, updated_at = ? WHERE id = ?",
    ).run(folderId, sortIndex, now, req.params.id);
  }
  const updated = db
    .prepare(
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.content_sha256, f.version, f.folder_id, f.sort_index,
              f.kind,
              (SELECT count(*) FROM archives a WHERE a.file_id = f.id) AS archive_count
       FROM files f WHERE f.id = ?`,
    )
    .get(req.params.id);
  res.json({ ok: true, ...mapFileRow(updated) });
});

router.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });

  db.prepare("DELETE FROM files WHERE id = ?").run(req.params.id);

  const dir = fileDir(req.params.id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

  res.json({ ok: true });
});

// ---------- archives ----------

router.post("/:id/archive", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });

  const archiveId = randomUUID();
  const label = req.body.label || "";
  const now = new Date().toISOString();
  const relPath = `files/${req.params.id}/archives/${archiveId}.excalidraw`;
  const absPath = archivePath(req.params.id, archiveId);

  const src = currentPath(req.params.id);
  if (!existsSync(src))
    return res.status(400).json({ error: "no current data to archive" });

  trimArchivesBeforeAppend(req.params.id);

  const content = readFileSync(src, "utf-8");
  const payload = req.body.deltas
    ? JSON.stringify({ ...JSON.parse(content), _deltas: req.body.deltas })
    : content;

  writeFileSync(absPath, payload, "utf-8");

  const parsedForHash = JSON.parse(payload);
  delete parsedForHash._deltas;
  const sha = hashSceneDataJson(parsedForHash);

  db.prepare(
    "INSERT INTO archives (id, file_id, label, created_at, path, content_sha256) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(archiveId, req.params.id, label, now, relPath, sha);

  res
    .status(201)
    .json({ id: archiveId, label, created_at: now, content_sha256: sha });
});

router.get("/:id/archives", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, label, created_at, content_sha256 FROM archives WHERE file_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(req.params.id, MAX_ARCHIVES_PER_FILE);
  log.info("GET /:id/archives (导入保存前会调)", {
    fileId: req.params.id.slice(0, 8),
    count: rows.length,
    max: MAX_ARCHIVES_PER_FILE,
  });
  res.json(rows);
});

router.patch("/:id/archives/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) {
    return res.status(404).json({ error: "archive not found" });
  }
  if (req.body.label !== undefined) {
    db.prepare("UPDATE archives SET label = ? WHERE id = ?").run(
      String(req.body.label),
      req.params.archiveId,
    );
  }
  const updated = db
    .prepare(
      "SELECT id, label, created_at, content_sha256 FROM archives WHERE id = ?",
    )
    .get(req.params.archiveId);
  res.json({ ok: true, ...updated });
});

router.get("/:id/archives/:archiveId", (req, res) => {
  const row = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!row) return res.status(404).json({ error: "archive not found" });

  const absPath = join(DATA_DIR, row.path);
  if (!existsSync(absPath))
    return res.status(404).json({ error: "archive file missing" });

  const data = JSON.parse(readFileSync(absPath, "utf-8"));
  res.json({ ...row, data });
});

router.post("/:id/restore/:archiveId", (req, res) => {
  const fileRow = db
    .prepare("SELECT * FROM files WHERE id = ?")
    .get(req.params.id);
  if (!fileRow) {
    return res.status(404).json({ error: "not found" });
  }
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) return res.status(404).json({ error: "archive not found" });

  const absPath = join(DATA_DIR, archive.path);
  if (!existsSync(absPath))
    return res.status(404).json({ error: "archive file missing" });

  const content = readFileSync(absPath, "utf-8");
  const parsed = JSON.parse(content);
  delete parsed._deltas;

  ensureFileDir(req.params.id);
  writeFileSync(currentPath(req.params.id), JSON.stringify(parsed), "utf-8");

  const now = new Date().toISOString();
  const sha = hashSceneDataJson(parsed);
  const restoredVersion = nextFileVersion(fileRow.version);
  db.prepare(
    "UPDATE files SET updated_at = ?, content_sha256 = ?, version = ? WHERE id = ?",
  ).run(now, sha, restoredVersion, req.params.id);

  res.json({
    ok: true,
    restored_from: req.params.archiveId,
    content_sha256: sha,
    version: restoredVersion,
  });
});

router.delete("/:id/archives/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) {
    log.warn("DELETE archive 404", {
      fileId: req.params.id.slice(0, 8),
      archiveId: req.params.archiveId.slice(0, 8),
    });
    return res.status(404).json({ error: "archive not found" });
  }

  log.info("DELETE archive (为保存腾快照位，导入亦可能触发)", {
    fileId: req.params.id.slice(0, 8),
    archiveId: req.params.archiveId.slice(0, 8),
  });

  deleteArchiveRow(archive);

  res.json({ ok: true });
});

export default router;
