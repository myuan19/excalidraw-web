import { randomUUID } from "crypto";
import { Router } from "express";
import db from "../db.js";

const router = Router();

function mapRow(row) {
  return { ...row, data: JSON.parse(row.data), sort_index: row.sort_index ?? 0 };
}

router.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT id, scope, file_id, name, data, created_at, sort_index FROM library_items WHERE scope = 'public' ORDER BY sort_index ASC, id ASC")
    .all();
  res.json(rows.map(mapRow));
});

router.post("/", (req, res) => {
  const id = req.body.id || randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index)
    VALUES (?, 'public', NULL, ?, ?, ?, ?)
  `).run(id, req.body.name || "", JSON.stringify(req.body.data || req.body.elements || []), now, Number(req.body.sort_index) || 0);
  res.status(201).json({ id, scope: "public", name: req.body.name || "", created_at: now });
});

router.delete("/public/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM library_items WHERE id = ? AND scope = 'public'").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.get("/personal", (_req, res) => {
  const rows = db
    .prepare("SELECT id, scope, file_id, name, data, created_at, sort_index FROM library_items WHERE scope = 'personal' ORDER BY sort_index ASC, id ASC")
    .all();
  res.json(rows.map(mapRow));
});

router.post("/personal", (req, res) => {
  const id = req.body.id || randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index)
    VALUES (?, 'personal', NULL, ?, ?, ?, ?)
  `).run(id, req.body.name || "", JSON.stringify(req.body.data || req.body.elements || []), now, Number(req.body.sort_index) || 0);
  res.status(201).json({ id, scope: "personal", name: req.body.name || "", created_at: now });
});

router.delete("/personal/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM library_items WHERE id = ? AND scope = 'personal'").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.get("/files/:fileId", (req, res) => {
  const rows = db
    .prepare("SELECT id, scope, file_id, name, data, created_at, sort_index FROM library_items WHERE scope = 'canvas' AND file_id = ? ORDER BY sort_index ASC, id ASC")
    .all(req.params.fileId);
  res.json(rows.map(mapRow));
});

router.post("/files/:fileId", (req, res) => {
  const id = req.body.id || randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index)
    VALUES (?, 'canvas', ?, ?, ?, ?, ?)
  `).run(id, req.params.fileId, req.body.name || "", JSON.stringify(req.body.data || req.body.elements || []), now, Number(req.body.sort_index) || 0);
  res.status(201).json({ id, scope: "canvas", file_id: req.params.fileId, name: req.body.name || "", created_at: now });
});

router.delete("/files/:fileId/:id", (req, res) => {
  const row = db
    .prepare("SELECT id FROM library_items WHERE id = ? AND scope = 'canvas' AND file_id = ?")
    .get(req.params.id, req.params.fileId);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.get("/groups", (_req, res) => {
  const rows = db
    .prepare("SELECT id, name, item_ids, sort_index, collapsed FROM library_groups ORDER BY sort_index ASC")
    .all();
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    itemIds: JSON.parse(row.item_ids),
    collapsed: !!row.collapsed,
  })));
});

router.post("/sync", (req, res) => {
  const { publicItems, personalItems, canvasItems, fileId, groups } = req.body || {};
  const replaceItems = (scope, items, scopedFileId = null) => {
    if (!Array.isArray(items)) return;
    const existing = scopedFileId
      ? db.prepare("SELECT id FROM library_items WHERE scope = ? AND file_id = ?").all(scope, scopedFileId)
      : db.prepare("SELECT id FROM library_items WHERE scope = ?").all(scope);
    const incoming = new Set(items.map((item) => item.id));
    for (const row of existing) {
      if (!incoming.has(row.id)) db.prepare("DELETE FROM library_items WHERE id = ?").run(row.id);
    }
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    items.forEach((item, index) => {
      upsert.run(
        item.id || randomUUID(),
        scope,
        scopedFileId,
        item.name || "",
        JSON.stringify(item.data || item.elements || []),
        item.created_at || new Date().toISOString(),
        item.sort_index ?? index,
      );
    });
  };

  db.transaction(() => {
    replaceItems("public", publicItems);
    replaceItems("personal", personalItems);
    if (fileId) replaceItems("canvas", canvasItems, fileId);
    if (Array.isArray(groups)) {
      db.prepare("DELETE FROM library_groups").run();
      const upsertGroup = db.prepare(`
        INSERT OR REPLACE INTO library_groups (id, name, item_ids, sort_index, collapsed)
        VALUES (?, ?, ?, ?, ?)
      `);
      groups.forEach((group, index) => {
        upsertGroup.run(
          group.id || randomUUID(),
          group.name || "",
          JSON.stringify(Array.isArray(group.itemIds) ? group.itemIds : []),
          group.sort_index ?? index,
          group.collapsed ? 1 : 0,
        );
      });
    }
  })();

  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
