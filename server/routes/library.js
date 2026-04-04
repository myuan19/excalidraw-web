import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";

const router = Router();

function mapRow(r) {
  return {
    ...r,
    data: JSON.parse(r.data),
    sort_index: r.sort_index ?? 0,
  };
}

// ---------- public library ----------

router.get("/", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id, scope, file_id, name, data, created_at, sort_index FROM library_items WHERE scope = 'public' ORDER BY sort_index ASC, id ASC",
    )
    .all();
  console.log("[excalidraw-web-server]", new Date().toISOString(), "GET /api/library (public)", rows.length, "items");
  res.json(rows.map(mapRow));
});

router.post("/", (req, res) => {
  const id = req.body.id || randomUUID();
  const name = req.body.name || "";
  const data = JSON.stringify(req.body.data || req.body.elements || []);
  const now = new Date().toISOString();
  const sortIndex = Number(req.body.sort_index) || 0;

  db.prepare(
    "INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index) VALUES (?, 'public', NULL, ?, ?, ?, ?)",
  ).run(id, name, data, now, sortIndex);

  res.status(201).json({ id, scope: "public", name, created_at: now });
});

router.delete("/public/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM library_items WHERE id = ? AND scope = 'public'")
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "not found" });
  }
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- personal library (server-backed, per deployment / user) ----------

router.get("/personal", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id, scope, file_id, name, data, created_at, sort_index FROM library_items WHERE scope = 'personal' ORDER BY sort_index ASC, id ASC",
    )
    .all();
  res.json(rows.map(mapRow));
});

router.delete("/personal/:id", (req, res) => {
  const row = db
    .prepare(
      "SELECT * FROM library_items WHERE id = ? AND scope = 'personal'",
    )
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "not found" });
  }
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- canvas-specific library (nested under /files/:fileId) ----------

router.get("/files/:fileId", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, scope, file_id, name, data, created_at, sort_index FROM library_items WHERE scope = 'canvas' AND file_id = ? ORDER BY sort_index ASC, id ASC",
    )
    .all(req.params.fileId);
  res.json(rows.map(mapRow));
});

router.post("/files/:fileId", (req, res) => {
  const id = req.body.id || randomUUID();
  const name = req.body.name || "";
  const data = JSON.stringify(req.body.data || req.body.elements || []);
  const now = new Date().toISOString();
  const sortIndex = Number(req.body.sort_index) || 0;

  db.prepare(
    "INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index) VALUES (?, 'canvas', ?, ?, ?, ?, ?)",
  ).run(id, req.params.fileId, name, data, now, sortIndex);

  res.status(201).json({
    id,
    scope: "canvas",
    file_id: req.params.fileId,
    name,
    created_at: now,
  });
});

router.delete("/files/:fileId/:id", (req, res) => {
  const row = db
    .prepare(
      "SELECT * FROM library_items WHERE id = ? AND scope = 'canvas' AND file_id = ?",
    )
    .get(req.params.id, req.params.fileId);
  if (!row) {
    return res.status(404).json({ error: "not found" });
  }
  db.prepare("DELETE FROM library_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- library groups ----------

router.get("/groups", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, item_ids, sort_index, collapsed FROM library_groups ORDER BY sort_index ASC",
    )
    .all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      itemIds: JSON.parse(r.item_ids),
      collapsed: !!r.collapsed,
    })),
  );
});

// ---------- bulk sync (used by CombinedLibraryAdapter) ----------

router.post("/sync", (req, res) => {
  console.log("[excalidraw-web-server]", new Date().toISOString(), "POST /api/library/sync", {
    publicCount: req.body?.publicItems?.length ?? "N/A",
    personalCount: req.body?.personalItems?.length ?? "N/A",
    canvasCount: req.body?.canvasItems?.length ?? "N/A",
    groupCount: req.body?.groups?.length ?? "N/A",
    fileId: req.body?.fileId ?? null,
  });
  const { publicItems, canvasItems, personalItems, fileId, groups } = req.body;

  const txn = db.transaction(() => {
    if (Array.isArray(publicItems)) {
      const existingPublic = db
        .prepare("SELECT id FROM library_items WHERE scope = 'public'")
        .all()
        .map((r) => r.id);
      const incomingIds = new Set(publicItems.map((i) => i.id));

      for (const eid of existingPublic) {
        if (!incomingIds.has(eid)) {
          db.prepare("DELETE FROM library_items WHERE id = ?").run(eid);
        }
      }

      const upsert = db.prepare(
        "INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index) VALUES (?, 'public', NULL, ?, ?, ?, ?)",
      );
      publicItems.forEach((item, idx) => {
        upsert.run(
          item.id,
          item.name || "",
          JSON.stringify(item.data || item.elements || []),
          item.created_at || new Date().toISOString(),
          item.sort_index ?? idx,
        );
      });
    }

    if (Array.isArray(canvasItems) && fileId) {
      const existingCanvas = db
        .prepare(
          "SELECT id FROM library_items WHERE scope = 'canvas' AND file_id = ?",
        )
        .all(fileId)
        .map((r) => r.id);
      const incomingIds = new Set(canvasItems.map((i) => i.id));

      for (const eid of existingCanvas) {
        if (!incomingIds.has(eid)) {
          db.prepare("DELETE FROM library_items WHERE id = ?").run(eid);
        }
      }

      const upsert = db.prepare(
        "INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index) VALUES (?, 'canvas', ?, ?, ?, ?, ?)",
      );
      canvasItems.forEach((item, idx) => {
        upsert.run(
          item.id,
          fileId,
          item.name || "",
          JSON.stringify(item.data || item.elements || []),
          item.created_at || new Date().toISOString(),
          item.sort_index ?? idx,
        );
      });
    }

    if (Array.isArray(personalItems)) {
      const existingPersonal = db
        .prepare("SELECT id FROM library_items WHERE scope = 'personal'")
        .all()
        .map((r) => r.id);
      const incomingIds = new Set(personalItems.map((i) => i.id));

      for (const eid of existingPersonal) {
        if (!incomingIds.has(eid)) {
          db.prepare("DELETE FROM library_items WHERE id = ?").run(eid);
        }
      }

      const upsert = db.prepare(
        "INSERT OR REPLACE INTO library_items (id, scope, file_id, name, data, created_at, sort_index) VALUES (?, 'personal', NULL, ?, ?, ?, ?)",
      );
      personalItems.forEach((item, idx) => {
        upsert.run(
          item.id,
          item.name || "",
          JSON.stringify(item.data || item.elements || []),
          item.created_at || new Date().toISOString(),
          item.sort_index ?? idx,
        );
      });
    }

    if (Array.isArray(groups)) {
      db.prepare("DELETE FROM library_groups").run();
      const upsertGroup = db.prepare(
        "INSERT OR REPLACE INTO library_groups (id, name, item_ids, sort_index, collapsed) VALUES (?, ?, ?, ?, ?)",
      );
      groups.forEach((g, idx) => {
        upsertGroup.run(
          g.id,
          g.name || "",
          JSON.stringify(Array.isArray(g.itemIds) ? g.itemIds : []),
          g.sort_index ?? idx,
          g.collapsed ? 1 : 0,
        );
      });
    }
  });

  txn();
  res.json({ ok: true });
});

export default router;
