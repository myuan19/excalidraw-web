import { randomUUID } from "crypto";
import { Router } from "express";
import db from "../db.js";
import { embedTokenActiveCache } from "../lib/embedActiveTokenCache.js";
import { requireSameOrigin } from "../lib/sameOrigin.js";
import { normalizeDomains } from "../lib/normalizeDomains.js";

const router = Router();

router.use(requireSameOrigin);

router.get("/", (req, res) => {
  const fileId = req.query.file_id;
  if (!fileId || typeof fileId !== "string") {
    return res.status(400).json({ error: "file_id required" });
  }
  const rows = db
    .prepare("SELECT id, token, file_id, allowed_domains, created_at, usage_count FROM embed_tokens WHERE file_id = ? ORDER BY created_at DESC")
    .all(fileId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const fileId = req.body.file_id;
  if (!fileId || typeof fileId !== "string") {
    return res.status(400).json({ error: "file_id required" });
  }
  const exists = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId);
  if (!exists) return res.status(404).json({ error: "file not found" });
  const row = {
    id: randomUUID(),
    token: randomUUID(),
    file_id: fileId,
    allowed_domains: normalizeDomains(req.body.allowed_domains),
    created_at: new Date().toISOString(),
    usage_count: 0,
  };
  if (!row.allowed_domains) return res.status(400).json({ error: "invalid_allowed_domains" });
  db.prepare(`
    INSERT INTO embed_tokens (id, token, file_id, allowed_domains, created_at, usage_count)
    VALUES (@id, @token, @file_id, @allowed_domains, @created_at, @usage_count)
  `).run(row);
  res.status(201).json(row);
});

router.patch("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM embed_tokens WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "token not found" });
  const allowed = normalizeDomains(req.body.allowed_domains);
  if (!allowed) return res.status(400).json({ error: "invalid_allowed_domains" });
  db.prepare("UPDATE embed_tokens SET allowed_domains = ? WHERE id = ?").run(allowed, req.params.id);
  embedTokenActiveCache.clear(row.token);
  res.json({ ...row, allowed_domains: allowed });
});

router.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT token FROM embed_tokens WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM embed_tokens WHERE id = ?").run(req.params.id);
  embedTokenActiveCache.clear(row?.token);
  res.json({ ok: true });
});

export default router;
