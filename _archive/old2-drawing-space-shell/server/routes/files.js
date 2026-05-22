import { Router } from "express";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import db, { DATA_DIR } from "../db.js";

const router = Router();
const MAX_ARCHIVES_PER_FILE = 8;

function fileDir(id) {
  return join(DATA_DIR, "files", id);
}

function currentPath(id) {
  return join(fileDir(id), "current.excalidraw");
}

function archivePath(fileId, archiveId) {
  const dir = join(fileDir(fileId), "archives");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${archiveId}.excalidraw`);
}

function thumbnailPath(id) {
  return join(fileDir(id), "thumbnail.svg");
}

function thumbnailMetaPath(id) {
  return join(fileDir(id), "thumbnail.meta.json");
}

function ensureFileDir(id) {
  if (!existsSync(fileDir(id))) mkdirSync(fileDir(id), { recursive: true });
}

function hashData(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function normalizeFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function folderExists(id) {
  return id === null || !!db.prepare("SELECT id FROM file_folders WHERE id = ?").get(id);
}

function nextSortIndex(table, parentColumn, parentId) {
  const where = parentId === null ? `${parentColumn} IS NULL` : `${parentColumn} = ?`;
  const sql = `SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM ${table} WHERE ${where}`;
  const row = parentId === null ? db.prepare(sql).get() : db.prepare(sql).get(parentId);
  return row?.next ?? 0;
}

function mapFile(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind || "excalidraw",
    created_at: row.created_at,
    updated_at: row.updated_at,
    folder_id: row.folder_id ?? null,
    sort_index: row.sort_index ?? 0,
    archive_count: row.archive_count ?? 0,
    has_thumbnail: existsSync(thumbnailPath(row.id)),
    content_sha256: row.content_sha256 ?? null,
  };
}

function mapFolder(row) {
  return {
    id: row.id,
    parent_id: row.parent_id ?? null,
    name: row.name,
    sort_index: row.sort_index ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function wouldCreateFolderCycle(folderId, nextParentId) {
  if (!nextParentId || folderId === nextParentId) return !!nextParentId;
  let cursor = nextParentId;
  while (cursor) {
    const row = db.prepare("SELECT parent_id FROM file_folders WHERE id = ?").get(cursor);
    if (!row) return false;
    cursor = row.parent_id;
    if (cursor === folderId) return true;
  }
  return false;
}

function trimArchives(fileId) {
  for (;;) {
    const count = db.prepare("SELECT COUNT(*) AS count FROM archives WHERE file_id = ?").get(fileId)?.count ?? 0;
    if (count < MAX_ARCHIVES_PER_FILE) return;
    const oldest = db.prepare("SELECT id, path FROM archives WHERE file_id = ? ORDER BY created_at ASC LIMIT 1").get(fileId);
    if (!oldest) return;
    const path = join(DATA_DIR, oldest.path);
    if (existsSync(path)) rmSync(path, { force: true });
    db.prepare("DELETE FROM archives WHERE id = ?").run(oldest.id);
  }
}

function parseArchiveLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 100);
}

function appendArchive(fileId, data) {
  trimArchives(fileId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const relPath = `files/${fileId}/archives/${id}.excalidraw`;
  writeFileSync(archivePath(fileId, id), JSON.stringify(data), "utf-8");
  db.prepare(`
    INSERT INTO archives (id, file_id, label, created_at, path, content_sha256)
    VALUES (?, ?, '', ?, ?, ?)
  `).run(id, fileId, now, relPath, hashData(data));
}

function fileRowsSql(where = "") {
  return `
    SELECT f.id, f.name, f.kind, f.created_at, f.updated_at, f.folder_id, f.sort_index, f.content_sha256,
           (SELECT COUNT(*) FROM archives a WHERE a.file_id = f.id) AS archive_count
    FROM files f
    ${where}
  `;
}

for (const row of db.prepare("SELECT id FROM files WHERE content_sha256 IS NULL").all()) {
  const path = currentPath(row.id);
  if (!existsSync(path)) continue;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    db.prepare("UPDATE files SET content_sha256 = ? WHERE id = ?").run(
      hashData(data),
      row.id,
    );
  } catch {
    // Ignore corrupt legacy files; GET /files/:id will surface the parse error.
  }
}

router.get("/tree", (_req, res) => {
  const folders = db.prepare(`
    SELECT id, parent_id, name, sort_index, created_at, updated_at
    FROM file_folders
    ORDER BY parent_id IS NOT NULL, parent_id ASC, sort_index ASC, name COLLATE NOCASE ASC
  `).all().map(mapFolder);
  const files = db.prepare(`${fileRowsSql()} ORDER BY f.folder_id IS NOT NULL, f.folder_id ASC, f.sort_index ASC, f.updated_at DESC`).all().map(mapFile);
  res.json({ folders, files });
});

router.get("/hashes", (_req, res) => {
  res.json(db.prepare("SELECT id, content_sha256 FROM files ORDER BY updated_at DESC").all());
});

router.post("/folders", (req, res) => {
  const parentId = normalizeFolderId(req.body.parent_id);
  if (!folderExists(parentId)) return res.status(404).json({ error: "folder not found" });
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = String(req.body.name || "新建文件夹").trim() || "新建文件夹";
  const sortIndex = Number.isFinite(Number(req.body.sort_index))
    ? Number(req.body.sort_index)
    : nextSortIndex("file_folders", "parent_id", parentId);
  db.prepare(`
    INSERT INTO file_folders (id, parent_id, name, sort_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, parentId, name, sortIndex, now, now);
  res.status(201).json({ id, parent_id: parentId, name, sort_index: sortIndex, created_at: now, updated_at: now });
});

router.patch("/folders/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM file_folders WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "folder not found" });
  const updates = [];
  const values = [];
  if (req.body.name !== undefined) {
    updates.push("name = ?");
    values.push(String(req.body.name || "新建文件夹").trim() || "新建文件夹");
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "parent_id")) {
    const parentId = normalizeFolderId(req.body.parent_id);
    if (!folderExists(parentId)) return res.status(404).json({ error: "folder not found" });
    if (wouldCreateFolderCycle(req.params.id, parentId)) return res.status(400).json({ error: "folder cycle" });
    updates.push("parent_id = ?");
    values.push(parentId);
  }
  updates.push("updated_at = ?");
  values.push(new Date().toISOString(), req.params.id);
  db.prepare(`UPDATE file_folders SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  res.json(mapFolder(db.prepare("SELECT * FROM file_folders WHERE id = ?").get(req.params.id)));
});

router.delete("/folders/:id", (req, res) => {
  const ids = [req.params.id];
  for (let i = 0; i < ids.length; i++) {
    for (const row of db.prepare("SELECT id FROM file_folders WHERE parent_id = ?").all(ids[i])) {
      ids.push(row.id);
    }
  }
  db.prepare(`UPDATE files SET folder_id = NULL WHERE folder_id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  db.prepare("DELETE FROM file_folders WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/move", (req, res) => {
  const folderId = normalizeFolderId(req.body.folder_id);
  if (!folderExists(folderId)) return res.status(404).json({ error: "folder not found" });
  const ids = Array.isArray(req.body.file_ids) ? req.body.file_ids.filter((id) => typeof id === "string") : [];
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return res.status(400).json({ error: "file_ids_required" });
  const placeholders = uniqueIds.map(() => "?").join(",");
  const existingIds = new Set(
    db.prepare(`SELECT id FROM files WHERE id IN (${placeholders})`).all(...uniqueIds).map((row) => row.id),
  );
  const missingIds = uniqueIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) {
    return res.status(404).json({ error: "files_not_found", file_ids: missingIds });
  }
  const stmt = db.prepare("UPDATE files SET folder_id = ?, sort_index = ?, updated_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  const start = nextSortIndex("files", "folder_id", folderId);
  db.transaction(() => uniqueIds.forEach((id, index) => stmt.run(folderId, start + index, now, id)))();
  res.json({ ok: true, moved: uniqueIds.length, updated_at: now });
});

router.post("/order", (req, res) => {
  const parentId = normalizeFolderId(req.body.parent_id);
  if (!folderExists(parentId)) return res.status(404).json({ error: "folder not found" });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const updateFile = db.prepare("UPDATE files SET folder_id = ?, sort_index = ? WHERE id = ?");
  const updateFolder = db.prepare("UPDATE file_folders SET parent_id = ?, sort_index = ? WHERE id = ?");
  db.transaction(() => {
    items.forEach((item, index) => {
      if (!item || typeof item.id !== "string") return;
      if (item.type === "file") updateFile.run(parentId, index, item.id);
      if (item.type === "folder" && !wouldCreateFolderCycle(item.id, parentId)) updateFolder.run(parentId, index, item.id);
    });
  })();
  res.json({ ok: true });
});

router.get("/", (_req, res) => {
  res.json(db.prepare(`${fileRowsSql()} ORDER BY f.updated_at DESC`).all().map(mapFile));
});

router.post("/", (req, res) => {
  const folderId = normalizeFolderId(req.body.folder_id);
  if (!folderExists(folderId)) return res.status(404).json({ error: "folder not found" });
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = String(req.body.name || "Untitled").trim() || "Untitled";
  const kind = String(req.body.kind || "excalidraw").trim() || "excalidraw";
  const sortIndex = nextSortIndex("files", "folder_id", folderId);
  db.prepare(`
    INSERT INTO files (id, name, kind, created_at, updated_at, folder_id, sort_index)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, kind, now, now, folderId, sortIndex);
  ensureFileDir(id);
  const empty = kind === "mindmap"
    ? { kind: "mindmap", containerVersion: 1, formatVersion: 1, data: { root: { data: { text: "<p>根节点</p>", richText: true, expand: true }, children: [] }, layout: "logicalStructure" } }
    : kind === "text"
      ? { kind: "text", containerVersion: 1, formatVersion: 1, data: { text: "" } }
      : { elements: [], appState: {}, files: {} };
  writeFileSync(currentPath(id), JSON.stringify(empty), "utf-8");
  res.status(201).json(mapFile(db.prepare(`${fileRowsSql("WHERE f.id = ?")}`).get(id)));
});

router.get("/:id", (req, res) => {
  const row = db.prepare(`${fileRowsSql("WHERE f.id = ?")}`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const path = currentPath(req.params.id);
  if (!existsSync(path)) return res.status(404).json({ error: "file data missing" });
  res.json({ ...mapFile(row), data: JSON.parse(readFileSync(path, "utf-8")) });
});

router.put("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (
    req.body.data !== undefined &&
    Object.prototype.hasOwnProperty.call(req.body, "expected_content_sha256") &&
    (row.content_sha256 ?? null) !== (req.body.expected_content_sha256 ?? null)
  ) {
    return res.status(409).json({
      error: "file_conflict",
      content_sha256: row.content_sha256 ?? null,
      message: "file has changed on server",
    });
  }
  const now = new Date().toISOString();
  let sha;
  let skipDataWrite = false;
  if (req.body.data !== undefined) {
    sha = hashData(req.body.data);
    const path = currentPath(req.params.id);
    if (existsSync(path)) {
      try {
        const existing = JSON.parse(readFileSync(path, "utf-8"));
        skipDataWrite = hashData(existing) === sha;
      } catch {
        skipDataWrite = false;
      }
    }
  }
  const hasThumb = typeof req.body.thumbnail === "string" && req.body.thumbnail.trim();
  const hasName = req.body.name !== undefined;
  if (skipDataWrite && !hasThumb && !hasName) {
    return res.json({
      ok: true,
      skipped: true,
      updated_at: row.updated_at,
      content_sha256: sha,
    });
  }
  if (req.body.data !== undefined && !skipDataWrite) {
    ensureFileDir(req.params.id);
    writeFileSync(currentPath(req.params.id), JSON.stringify(req.body.data), "utf-8");
    appendArchive(req.params.id, req.body.data);
  }
  if (hasThumb) {
    ensureFileDir(req.params.id);
    writeFileSync(thumbnailPath(req.params.id), req.body.thumbnail, "utf-8");
    writeFileSync(thumbnailMetaPath(req.params.id), JSON.stringify({ content_sha256: sha ?? row.content_sha256, updated_at: now }), "utf-8");
  }
  const name = req.body.name !== undefined ? String(req.body.name || row.name).trim() || row.name : row.name;
  db.prepare("UPDATE files SET name = ?, updated_at = ?, content_sha256 = COALESCE(?, content_sha256) WHERE id = ?").run(name, now, sha ?? null, req.params.id);
  res.json({ ok: true, updated_at: now, ...(sha && { content_sha256: sha }) });
});

router.patch("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const name = req.body.name !== undefined ? String(req.body.name || row.name).trim() || row.name : row.name;
  const folderId = Object.prototype.hasOwnProperty.call(req.body, "folder_id") ? normalizeFolderId(req.body.folder_id) : row.folder_id;
  if (!folderExists(folderId)) return res.status(404).json({ error: "folder not found" });
  const now = new Date().toISOString();
  db.prepare("UPDATE files SET name = ?, folder_id = ?, updated_at = ? WHERE id = ?").run(name, folderId, now, req.params.id);
  res.json(mapFile(db.prepare(`${fileRowsSql("WHERE f.id = ?")}`).get(req.params.id)));
});

router.get("/:id/thumbnail", (req, res) => {
  const path = thumbnailPath(req.params.id);
  if (!existsSync(path)) return res.status(404).json({ error: "no thumbnail" });
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", req.query.h ? "public, max-age=31536000, immutable" : "public, max-age=300");
  res.send(readFileSync(path, "utf-8"));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM files WHERE id = ?").run(req.params.id);
  if (existsSync(fileDir(req.params.id))) rmSync(fileDir(req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
});

router.post("/:id/archive", (req, res) => {
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!file) return res.status(404).json({ error: "not found" });
  const path = currentPath(req.params.id);
  if (!existsSync(path)) return res.status(400).json({ error: "no current data to archive" });

  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    return res.status(500).json({ error: "corrupt scene file", message: error.message });
  }
  const archiveId = randomUUID();
  const now = new Date().toISOString();
  const relPath = `files/${req.params.id}/archives/${archiveId}.excalidraw`;
  const payload = req.body?.deltas ? { ...data, _deltas: req.body.deltas } : data;
  trimArchives(req.params.id);
  writeFileSync(archivePath(req.params.id, archiveId), JSON.stringify(payload), "utf-8");
  const hashSource = { ...payload };
  delete hashSource._deltas;
  const sha = hashData(hashSource);
  db.prepare(`
    INSERT INTO archives (id, file_id, label, created_at, path, content_sha256)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(archiveId, req.params.id, String(req.body?.label || ""), now, relPath, sha);
  res.status(201).json({ id: archiveId, label: req.body?.label || "", created_at: now, content_sha256: sha });
});

router.get("/:id/archives", (req, res) => {
  const file = db.prepare("SELECT id FROM files WHERE id = ?").get(req.params.id);
  if (!file) return res.status(404).json({ error: "not found" });
  const limit = parseArchiveLimit(req.query.limit);
  res.json(
    db.prepare("SELECT id, label, created_at, content_sha256 FROM archives WHERE file_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(req.params.id, limit),
  );
});

router.patch("/:id/archives/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) return res.status(404).json({ error: "archive not found" });
  if (req.body.label !== undefined) {
    db.prepare("UPDATE archives SET label = ? WHERE id = ?").run(
      String(req.body.label),
      req.params.archiveId,
    );
  }
  res.json(db.prepare("SELECT id, label, created_at, content_sha256 FROM archives WHERE id = ?").get(req.params.archiveId));
});

router.get("/:id/archives/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) return res.status(404).json({ error: "archive not found" });
  const path = join(DATA_DIR, archive.path);
  if (!existsSync(path)) return res.status(404).json({ error: "archive data missing" });
  const data = JSON.parse(readFileSync(path, "utf-8"));
  res.json({ id: archive.id, label: archive.label, created_at: archive.created_at, content_sha256: archive.content_sha256 ?? null, data });
});

router.post("/:id/restore/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) return res.status(404).json({ error: "archive not found" });
  const path = join(DATA_DIR, archive.path);
  if (!existsSync(path)) return res.status(404).json({ error: "archive data missing" });
  const data = JSON.parse(readFileSync(path, "utf-8"));
  delete data._deltas;
  const now = new Date().toISOString();
  const sha = hashData(data);
  ensureFileDir(req.params.id);
  writeFileSync(currentPath(req.params.id), JSON.stringify(data), "utf-8");
  db.prepare("UPDATE files SET updated_at = ?, content_sha256 = ? WHERE id = ?").run(
    now,
    sha,
    req.params.id,
  );
  res.json({ ok: true, restored_from: req.params.archiveId, updated_at: now, content_sha256: sha });
});

router.delete("/:id/archives/:archiveId", (req, res) => {
  const row = db.prepare("SELECT path FROM archives WHERE id = ? AND file_id = ?").get(req.params.archiveId, req.params.id);
  if (row) {
    const path = join(DATA_DIR, row.path);
    if (existsSync(path)) rmSync(path, { force: true });
  }
  db.prepare("DELETE FROM archives WHERE id = ? AND file_id = ?").run(req.params.archiveId, req.params.id);
  res.json({ ok: true });
});

export default router;
