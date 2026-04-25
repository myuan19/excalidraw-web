import { Router } from "express";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import db, { DATA_DIR } from "../db.js";

const router = Router();

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

function normalizeFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nextSortIndex(table, parentColumn, parentId) {
  const where = parentId == null ? `${parentColumn} IS NULL` : `${parentColumn} = ?`;
  const row =
    parentId == null
      ? db.prepare(`SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM ${table} WHERE ${where}`).get()
      : db.prepare(`SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM ${table} WHERE ${where}`).get(parentId);
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
    folder_id: r.folder_id ?? null,
    sort_index: r.sort_index ?? 0,
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

/** 在插入新快照之前腾出位置，避免先出现第 9 条再删（与客户端「满 8 删最旧」一致） */
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
        `SELECT id, path FROM archives WHERE file_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .get(fileId);
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
}

function appendVersionSnapshot(fileId, dataObj) {
  trimArchivesBeforeAppend(fileId);
  const archiveId = randomUUID();
  const now = new Date().toISOString();
  const relPath = `files/${fileId}/archives/${archiveId}.excalidraw`;
  const absPath = archivePath(fileId, archiveId);
  const jsonStr = JSON.stringify(dataObj);
  const sha = hashSceneDataJson(dataObj);
  writeFileSync(absPath, jsonStr, "utf-8");
  db.prepare(
    `INSERT INTO archives (id, file_id, label, created_at, path, content_sha256) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(archiveId, fileId, "", now, relPath, sha);
  return archiveId;
}

function ensureFileDir(fileId) {
  const dir = fileDir(fileId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---------- backfill content_sha256 for existing files ----------
{
  const rows = db.prepare(`SELECT id FROM files WHERE content_sha256 IS NULL`).all();
  for (const r of rows) {
    const fp = currentPath(r.id);
    if (existsSync(fp)) {
      try {
        const data = JSON.parse(readFileSync(fp, "utf-8"));
        const sha = hashSceneDataJson(data);
        db.prepare("UPDATE files SET content_sha256 = ? WHERE id = ?").run(sha, r.id);
      } catch { /* skip corrupt files */ }
    }
  }
  if (rows.length) {
    console.log(`[excalidraw-web-server] backfilled content_sha256 for ${rows.length} file(s)`);
  }
}

// ---------- files CRUD ----------

router.get("/hashes", (_req, res) => {
  const rows = db
    .prepare(`SELECT id, content_sha256 FROM files ORDER BY updated_at DESC`)
    .all();
  res.json(rows);
});

router.get("/tree", (_req, res) => {
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
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.content_sha256, f.folder_id, f.sort_index,
              (SELECT count(*) FROM archives a WHERE a.file_id = f.id) AS archive_count
       FROM files f
       ORDER BY f.folder_id IS NOT NULL, f.folder_id ASC, f.sort_index ASC, f.updated_at DESC`,
    )
    .all()
    .map(mapFileRow);
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
  const sortIndex =
    Number.isFinite(Number(req.body.sort_index))
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
  const nextParentId = hasParent ? normalizeFolderId(req.body.parent_id) : row.parent_id;
  if (!assertFolderExists(nextParentId, res)) {
    return;
  }
  if (wouldCreateFolderCycle(req.params.id, nextParentId)) {
    return res.status(400).json({ error: "cannot move folder into itself" });
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE file_folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?",
  ).run(nextName, nextParentId, now, req.params.id);
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
  const now = new Date().toISOString();
  const moveTxn = db.transaction(() => {
    const update = db.prepare(
      "UPDATE files SET folder_id = ?, sort_index = ?, updated_at = ? WHERE id = ?",
    );
    let sortIndex = nextSortIndex("files", "folder_id", folderId);
    for (const fileId of fileIds) {
      update.run(folderId, sortIndex++, now, fileId);
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
      "UPDATE file_folders SET parent_id = ?, sort_index = ?, updated_at = ? WHERE id = ?",
    );
    const now = new Date().toISOString();
    items.forEach((item, index) => {
      if (!item || typeof item.id !== "string") {
        return;
      }
      if (item.type === "folder") {
        if (!wouldCreateFolderCycle(item.id, parentId)) {
          updateFolder.run(parentId, index, now, item.id);
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
  console.log("[excalidraw-web-server]", new Date().toISOString(), "GET /api/files list");
  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.content_sha256, f.folder_id, f.sort_index,
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
  const folderId = normalizeFolderId(req.body.folder_id);
  if (!assertFolderExists(folderId, res)) {
    return;
  }
  const now = new Date().toISOString();
  console.log("[excalidraw-web-server]", now, "POST /api/files (create)", { id: id.slice(0, 8), name });

  const sortIndex = nextSortIndex("files", "folder_id", folderId);
  db.prepare(
    "INSERT INTO files (id, name, created_at, updated_at, folder_id, sort_index) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    name,
    now,
    now,
    folderId,
    sortIndex,
  );

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
    created_at: now,
    updated_at: now,
    folder_id: folderId,
    sort_index: sortIndex,
  });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });

  const fp = currentPath(req.params.id);
  if (!existsSync(fp)) return res.status(404).json({ error: "file data missing" });

  const data = JSON.parse(readFileSync(fp, "utf-8"));
  res.json({ ...row, data });
});

router.put("/:id", (req, res) => {
  const id = req.params.id;
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "not found" });

  const hasData = !!req.body.data;
  const hasThumb = typeof req.body.thumbnail === "string" && req.body.thumbnail.length > 0;
  const hasName = !!req.body.name;
  const elementCount = hasData && Array.isArray(req.body.data?.elements) ? req.body.data.elements.length : 0;
  const fileCount = hasData && req.body.data?.files ? Object.keys(req.body.data.files).length : 0;
  console.log("[excalidraw-web-server]", new Date().toISOString(), "PUT /api/files/:id", {
    id: id.slice(0, 8),
    hasData,
    hasName,
    name: req.body.name || "(unchanged)",
    hasThumb,
    thumbLen: hasThumb ? req.body.thumbnail.length : 0,
    elementCount,
    fileCount,
  });

  /** 与磁盘上当前文件内容一致则跳过数据写入与版本记录（仍允许仅改文件名或缩略图） */
  let skipDataWrite = false;
  if (hasData) {
    const fp = currentPath(id);
    if (existsSync(fp)) {
      try {
        const existingData = JSON.parse(readFileSync(fp, "utf-8"));
        if (hashSceneDataJson(existingData) === hashSceneDataJson(req.body.data)) {
          skipDataWrite = true;
        }
      } catch {
        // fall through to normal save
      }
    }
  }

  if (skipDataWrite && !req.body.name && !hasThumb) {
    const sha = hasData ? hashSceneDataJson(req.body.data) : undefined;
    console.log("[excalidraw-web-server]", new Date().toISOString(), "PUT /api/files/:id → SKIPPED (unchanged)", { id: id.slice(0, 8), sha: sha?.slice(0, 8) });
    return res.json({
      ok: true,
      skipped: true,
      ...(sha !== undefined && { content_sha256: sha }),
      updated_at: row.updated_at,
    });
  }

  const now = new Date().toISOString();

  if (req.body.data && !skipDataWrite) {
    ensureFileDir(id);
    writeFileSync(currentPath(id), JSON.stringify(req.body.data), "utf-8");
    appendVersionSnapshot(id, req.body.data);
  }

  if (req.body.thumbnail) {
    ensureFileDir(id);
    writeFileSync(thumbnailPath(id), req.body.thumbnail, "utf-8");
  }

  let contentSha256Out;
  if (hasData) {
    const src = skipDataWrite
      ? JSON.parse(readFileSync(currentPath(id), "utf-8"))
      : req.body.data;
    contentSha256Out = hashSceneDataJson(src);
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

  if (req.body.name) {
    db.prepare("UPDATE files SET name = ?, updated_at = ?, content_sha256 = COALESCE(?, content_sha256) WHERE id = ?").run(
      req.body.name, now, contentSha256Out ?? null, id,
    );
  } else {
    db.prepare("UPDATE files SET updated_at = ?, content_sha256 = COALESCE(?, content_sha256) WHERE id = ?").run(
      now, contentSha256Out ?? null, id,
    );
  }

  console.log("[excalidraw-web-server]", now, "PUT /api/files/:id → SAVED", {
    id: id.slice(0, 8),
    skipDataWrite,
    wroteThumb: !!req.body.thumbnail,
    sha: contentSha256Out?.slice(0, 8) ?? "none",
  });
  res.json({
    ok: true,
    updated_at: now,
    ...(contentSha256Out !== undefined && { content_sha256: contentSha256Out }),
  });
});

router.get("/:id/thumbnail", (req, res) => {
  const tp = thumbnailPath(req.params.id);
  if (!existsSync(tp)) {
    return res.status(404).json({ error: "no thumbnail" });
  }
  const svg = readFileSync(tp, "utf-8");
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
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.content_sha256, f.folder_id, f.sort_index,
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
  if (!existsSync(src)) return res.status(400).json({ error: "no current data to archive" });

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

  res.status(201).json({ id: archiveId, label, created_at: now, content_sha256: sha });
});

router.get("/:id/archives", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, label, created_at, content_sha256 FROM archives WHERE file_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(req.params.id, MAX_ARCHIVES_PER_FILE);
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
    .prepare("SELECT id, label, created_at, content_sha256 FROM archives WHERE id = ?")
    .get(req.params.archiveId);
  res.json({ ok: true, ...updated });
});

router.get("/:id/archives/:archiveId", (req, res) => {
  const row = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!row) return res.status(404).json({ error: "archive not found" });

  const absPath = join(DATA_DIR, row.path);
  if (!existsSync(absPath)) return res.status(404).json({ error: "archive file missing" });

  const data = JSON.parse(readFileSync(absPath, "utf-8"));
  res.json({ ...row, data });
});

router.post("/:id/restore/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) return res.status(404).json({ error: "archive not found" });

  const absPath = join(DATA_DIR, archive.path);
  if (!existsSync(absPath)) return res.status(404).json({ error: "archive file missing" });

  const content = readFileSync(absPath, "utf-8");
  const parsed = JSON.parse(content);
  delete parsed._deltas;

  ensureFileDir(req.params.id);
  writeFileSync(currentPath(req.params.id), JSON.stringify(parsed), "utf-8");

  const now = new Date().toISOString();
  db.prepare("UPDATE files SET updated_at = ? WHERE id = ?").run(now, req.params.id);

  res.json({ ok: true, restored_from: req.params.archiveId });
});

router.delete("/:id/archives/:archiveId", (req, res) => {
  const archive = db
    .prepare("SELECT * FROM archives WHERE id = ? AND file_id = ?")
    .get(req.params.archiveId, req.params.id);
  if (!archive) {
    return res.status(404).json({ error: "archive not found" });
  }

  const absPath = join(DATA_DIR, archive.path);
  db.prepare("DELETE FROM archives WHERE id = ?").run(req.params.archiveId);
  if (existsSync(absPath)) {
    try {
      rmSync(absPath, { force: true });
    } catch {
      // ignore
    }
  }

  res.json({ ok: true });
});

export default router;
