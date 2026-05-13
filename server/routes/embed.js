import { Router } from "express";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import db, { DATA_DIR } from "../db.js";
import { createLogger } from "../lib/logger.js";
import {
  isAllowedMindMapEmbedAssetPath,
  rewriteMindMapCssForEmbed,
  rewriteMindMapHtmlForEmbed,
} from "../lib/embedMindMapAssets.js";
import { buildEmbedRuntimeAssetInterceptor } from "../lib/embedRuntimeAssets.js";
import { createEmbedTokenActiveCache } from "../lib/embedTokenCache.js";
import { injectEmbedBootstrap } from "../lib/embedPageHtml.js";
import {
  isPublicEmbedStaticAssetPath,
  isTokenProtectedEmbedPath,
} from "../lib/embedStaticPolicy.js";

const log = createLogger({ module: "embed" });

const __dirname = dirname(fileURLToPath(import.meta.url));

const tokenRouter = Router();
const pageRouter = Router();
const TOKEN_SELECT =
  "id, token, file_id, allowed_domains, created_at, usage_count";
const TOKEN_ACTIVE_CACHE_TTL_MS = 10_000;

function currentPath(fileId) {
  return join(DATA_DIR, "files", fileId, "current.excalidraw");
}

function summarizeEmbedData(data) {
  if (!data || typeof data !== "object") {
    return {
      type: data === null ? "null" : typeof data,
    };
  }
  const inner =
    data.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : null;
  return {
    keys: Object.keys(data).slice(0, 12),
    kind: typeof data.kind === "string" ? data.kind : null,
    containerVersion:
      typeof data.containerVersion === "number" ? data.containerVersion : null,
    formatVersion: typeof data.formatVersion === "number" ? data.formatVersion : null,
    topElements: Array.isArray(data.elements) ? data.elements.length : null,
    topRootChildren:
      data.root && Array.isArray(data.root.children) ? data.root.children.length : null,
    dataKeys: inner ? Object.keys(inner).slice(0, 12) : null,
    dataElements: inner && Array.isArray(inner.elements) ? inner.elements.length : null,
    dataRootChildren:
      inner && inner.root && Array.isArray(inner.root.children)
        ? inner.root.children.length
        : null,
  };
}

function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) {
    return "";
  }
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) {
    return "";
  }
  return host;
}

function parseAllowedDomainsInput(value) {
  if (typeof value !== "string") {
    return "*";
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") {
    return "*";
  }
  const domains = [];
  for (const part of trimmed.split(",")) {
    const raw = part.trim();
    const host = normalizeHost(raw);
    if (!raw || !host) {
      return null;
    }
    if (!domains.includes(host)) {
      domains.push(host);
    }
  }
  return domains.length ? domains.join(",") : null;
}

function getRequestHost(req) {
  const rawHost = req.get("host") || "";
  return normalizeHost(rawHost.split(",")[0].split(":")[0]);
}

function getRequestOriginHost(req) {
  const origin = req.get("origin");
  if (origin) {
    try {
      return normalizeHost(new URL(origin).hostname);
    } catch {
      return "";
    }
  }
  const referer = req.get("referer");
  if (referer) {
    try {
      return normalizeHost(new URL(referer).hostname);
    } catch {
      return "";
    }
  }
  return "";
}

function isSameOriginRequest(req) {
  const sourceHost = getRequestOriginHost(req);
  const targetHost = getRequestHost(req);
  return !!sourceHost && !!targetHost && sourceHost === targetHost;
}

function requireSameOrigin(req, res, next) {
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ error: "same_origin_required" });
  }
  next();
}

// ---------------------------------------------------------------------------
// Token management API  (/api/embed-tokens)
// ---------------------------------------------------------------------------

tokenRouter.use(requireSameOrigin);

tokenRouter.post("/", (req, res) => {
  const fileId = req.body.file_id;
  if (!fileId || typeof fileId !== "string") {
    return res.status(400).json({ error: "file_id required" });
  }
  const fileRow = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId);
  if (!fileRow) {
    return res.status(404).json({ error: "file not found" });
  }

  const id = randomUUID();
  const token = randomUUID();
  const allowedDomains = parseAllowedDomainsInput(req.body.allowed_domains);
  if (!allowedDomains) {
    return res.status(400).json({ error: "invalid_allowed_domains" });
  }

  db.prepare(
    `INSERT INTO embed_tokens (id, token, file_id, allowed_domains)
     VALUES (?, ?, ?, ?)`,
  ).run(id, token, fileId, allowedDomains);

  log.info("token created", {
    id: id.slice(0, 8),
    fileId: fileId.slice(0, 8),
  });

  res.status(201).json({
    id,
    token,
    file_id: fileId,
    allowed_domains: allowedDomains,
    created_at: new Date().toISOString(),
    usage_count: 0,
  });
});

tokenRouter.patch("/:id", (req, res) => {
  const row = db
    .prepare(`SELECT ${TOKEN_SELECT} FROM embed_tokens WHERE id = ?`)
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "token not found" });
  }

  const allowedDomains = parseAllowedDomainsInput(req.body.allowed_domains);
  if (!allowedDomains) {
    return res.status(400).json({ error: "invalid_allowed_domains" });
  }
  db.prepare("UPDATE embed_tokens SET allowed_domains = ? WHERE id = ?").run(
    allowedDomains,
    req.params.id,
  );
  embedTokenActiveCache.clear(row.token);

  log.info("token domains updated", { id: req.params.id.slice(0, 8) });
  res.json({ ...row, allowed_domains: allowedDomains });
});

tokenRouter.get("/", (req, res) => {
  const fileId = req.query.file_id;
  if (!fileId || typeof fileId !== "string") {
    return res.status(400).json({ error: "file_id required" });
  }
  const rows = db
    .prepare(
      `SELECT ${TOKEN_SELECT} FROM embed_tokens WHERE file_id = ? ORDER BY created_at DESC`,
    )
    .all(fileId);
  res.json(rows);
});

tokenRouter.delete("/:id", (req, res) => {
  const row = db
    .prepare("SELECT id FROM embed_tokens WHERE id = ?")
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "token not found" });
  }
  const tokenRow = db
    .prepare("SELECT token FROM embed_tokens WHERE id = ?")
    .get(req.params.id);
  db.prepare("DELETE FROM embed_tokens WHERE id = ?").run(req.params.id);
  embedTokenActiveCache.clear(tokenRow?.token);
  log.info("token deleted", { id: req.params.id.slice(0, 8) });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Embed page  (/embed/:fileId?token=xxx)
//
// Strategy: read the SPA's built index.html, inject scene data + embed flag
// so the same React bundle renders in embed mode — no separate build needed.
// ---------------------------------------------------------------------------

function validateEmbedToken(req, token = req.query.token) {
  if (!token) {
    return { ok: false, status: 403, error: "Missing embed token" };
  }

  const fileId = req.params.fileId;
  const row = db
    .prepare(`SELECT ${TOKEN_SELECT} FROM embed_tokens WHERE token = ? AND file_id = ?`)
    .get(token, fileId);

  if (!row) {
    return { ok: false, status: 403, error: "Invalid token" };
  }

  if (row.allowed_domains && row.allowed_domains !== "*") {
    const allowed = row.allowed_domains
      .split(",")
      .map(normalizeHost)
      .filter(Boolean);
    const sourceHost = getRequestOriginHost(req);
    if (
      !sourceHost ||
      !allowed.some((d) => sourceHost === d || sourceHost.endsWith(`.${d}`))
    ) {
      return { ok: false, status: 403, error: "Domain not allowed" };
    }
  }

  return { ok: true, row };
}

function buildFrameAncestors(allowedDomains) {
  // CSP `frame-ancestors *` only matches network schemes (http/https/ws/wss);
  // chrome-extension: must be listed explicitly for browser extension iframes.
  const extensionSchemes = "chrome-extension: moz-extension:";
  if (!allowedDomains || allowedDomains === "*") {
    return `* ${extensionSchemes}`;
  }
  const hosts = allowedDomains
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
  if (hosts.length === 0) {
    return `* ${extensionSchemes}`;
  }
  return hosts.map((h) => `https://${h} http://${h}`).join(" ") + ` ${extensionSchemes}`;
}

function escapeForScript(s) {
  return s.replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}

function findSpaIndexHtml() {
  const raw = (process.env.SERVE_SPA || "").trim();
  const defaultRoot = join(__dirname, "../../excalidraw-app/build");
  const dockerRoot = "/var/www/excalidraw-static";
  let root;
  if (!raw || raw === "1" || raw === "true") {
    root = defaultRoot;
  } else if (raw !== "0" && raw !== "false") {
    root = join(__dirname, raw);
    if (!existsSync(join(root, "index.html")) && existsSync(join(raw, "index.html"))) {
      root = raw;
    }
  } else {
    root = defaultRoot;
  }
  const indexPath = join(root, "index.html");
  if (existsSync(indexPath)) {
    return indexPath;
  }
  const dockerIndexPath = join(dockerRoot, "index.html");
  return existsSync(dockerIndexPath) ? dockerIndexPath : null;
}

function findEmbedIndexHtml() {
  const spaIndexPath = findSpaIndexHtml();
  if (!spaIndexPath) {
    return null;
  }
  const root = dirname(spaIndexPath);
  const embedIndexPath = join(root, "embed/index.html");
  return existsSync(embedIndexPath) ? embedIndexPath : spaIndexPath;
}

function rewriteSpaAssetRefsForEmbed(html, encodedToken) {
  let out = html.replace(
    /((?:src|href)=["'])(?:\.\.\/|\.\/)?(?:\/)?assets\/([^"']+)(["'])/g,
    `$1/embed/assets/$2?_t=${encodedToken}$3`,
  );
  out = out.replace(
    /((?:src|href)=["'])(?:\.\.\/|\.\/)?(?:\/)?fonts\/([^"']+)(["'])/g,
    `$1/embed/fonts/$2?_t=${encodedToken}$3`,
  );
  return out;
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Excalidraw Embed</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; background: #f8f9fa; color: #495057;
  }
  .box {
    text-align: center; padding: 2rem;
    border: 1px solid #dee2e6; border-radius: 12px; background: #fff;
    max-width: 400px;
  }
  .code { font-size: 3rem; font-weight: 700; color: #e03131; }
  .msg { margin-top: .75rem; font-size: 1.1rem; }
</style>
</head>
<body>
  <div class="box">
    <div class="code">403</div>
    <div class="msg">${String(message).replace(/</g, "&lt;")}</div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Embed sub-resource gating — cookie / query-param token check
// ---------------------------------------------------------------------------

function getEmbedCookie(req) {
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)__embed_t=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function getEmbedRefererToken(req) {
  const referer = req.get("referer");
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return u.searchParams.get("_t") || u.searchParams.get("token");
  } catch {
    return null;
  }
}

function getEmbedRequestToken(req) {
  return (
    req.query._t ||
    req.query.token ||
    getEmbedCookie(req) ||
    getEmbedRefererToken(req)
  );
}

const embedTokenActiveCache = createEmbedTokenActiveCache({
  ttlMs: TOKEN_ACTIVE_CACHE_TTL_MS,
  now: () => Date.now(),
  lookup(token) {
    if (!token) return false;
    const row = db
      .prepare("SELECT id FROM embed_tokens WHERE token = ?")
      .get(token);
    return !!row;
  },
});

function isTokenActive(token) {
  if (!token) return false;
  return embedTokenActiveCache.isActive(token);
}

function embedAssetGate(req, res, next) {
  if (isPublicEmbedStaticAssetPath(req.path)) {
    return next();
  }
  const token = getEmbedRequestToken(req);
  if (!isTokenActive(token)) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  next();
}

function embedMindMapGate(req, res, next) {
  const assetPath = routePath(req) || "index.html";
  if (assetPath.startsWith("dist/")) {
    return next();
  }
  return embedAssetGate(req, res, next);
}

function getAssetsRoot() {
  const idx = findSpaIndexHtml();
  if (idx) return dirname(idx);
  const fallback = "/var/www/excalidraw-static";
  if (existsSync(fallback)) return fallback;
  return null;
}

function getMindMapRoot() {
  const root = getAssetsRoot();
  if (root) {
    const buildMindMapRoot = join(root, "mind-map");
    if (existsSync(join(buildMindMapRoot, "index.html"))) {
      return buildMindMapRoot;
    }
  }

  const localMindMapRoot = join(__dirname, "../../public/mind-map");
  if (existsSync(join(localMindMapRoot, "index.html"))) {
    return localMindMapRoot;
  }

  return null;
}

function safeJoin(base, userPath) {
  const resolved = resolve(base, userPath);
  const baseResolved = resolve(base);
  if (!resolved.startsWith(baseResolved + "/")) return null;
  return resolved;
}

// ── Token-gated static assets  (/embed/assets/*, /embed/fonts/*) ──

const _cssCache = new Map();

function setImmutableEmbedAssetCache(res) {
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function routePath(req) {
  try {
    return decodeURIComponent(req.path.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

function sendEmbedAsset(req, res) {
  const root = getAssetsRoot();
  if (!root) return res.status(500).type("text/plain").send("Assets not available");

  const assetPath = routePath(req);
  if (!assetPath) return res.status(400).type("text/plain").send("Bad request");

  const filePath = safeJoin(join(root, "assets"), assetPath);
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).type("text/plain").send("Not found");
  }

  if (assetPath.endsWith(".css")) {
    const stat = statSync(filePath);
    const cached = _cssCache.get(filePath);
    const encodedToken = encodeURIComponent(String(getEmbedRequestToken(req) || ""));
    const rawCss =
      cached && cached.mtimeMs === stat.mtimeMs
        ? cached.content
        : readFileSync(filePath, "utf-8");
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      _cssCache.set(filePath, { mtimeMs: stat.mtimeMs, content: rawCss });
    }
    const css = rawCss.replace(
      /url\((["']?)(?:\.\/)?(?:\/)?fonts\/([^)"']+)\1\)/g,
      `url($1/embed/fonts/$2?_t=${encodedToken}$1)`,
    );
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    setImmutableEmbedAssetCache(res);
    return res.send(css);
  }

  setImmutableEmbedAssetCache(res);
  res.sendFile(filePath);
}

function sendEmbedFont(req, res) {
  const root = getAssetsRoot();
  if (!root) return res.status(500).type("text/plain").send("Assets not available");

  const fontPath = routePath(req);
  if (!fontPath) return res.status(400).type("text/plain").send("Bad request");

  const filePath = safeJoin(join(root, "fonts"), fontPath);
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).type("text/plain").send("Not found");
  }

  setImmutableEmbedAssetCache(res);
  res.sendFile(filePath);
}

function sendEmbedMindMap(req, res) {
  const root = getMindMapRoot();
  if (!root) {
    return res.status(500).type("text/plain").send("MindMap assets not available");
  }

  const rawAssetPath = routePath(req);
  if (rawAssetPath === null) {
    return res.status(400).type("text/plain").send("Bad request");
  }

  const assetPath = rawAssetPath || "index.html";
  if (!isAllowedMindMapEmbedAssetPath(assetPath)) {
    return res.status(404).type("text/plain").send("Not found");
  }

  const filePath = safeJoin(root, assetPath);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return res.status(404).type("text/plain").send("Not found");
  }

  const encodedToken = encodeURIComponent(
    String(getEmbedRequestToken(req) || ""),
  );

  if (assetPath.endsWith(".html")) {
    const html = rewriteMindMapHtmlForEmbed(
      readFileSync(filePath, "utf-8"),
      encodedToken,
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(html);
  }

  if (assetPath.endsWith(".css")) {
    const stat = statSync(filePath);
    const cached = _cssCache.get(filePath);
    const rawCss =
      cached && cached.mtimeMs === stat.mtimeMs
        ? cached.content
        : readFileSync(filePath, "utf-8");
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      _cssCache.set(filePath, { mtimeMs: stat.mtimeMs, content: rawCss });
    }
    const css = rewriteMindMapCssForEmbed(rawCss, assetPath, encodedToken);
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    setImmutableEmbedAssetCache(res);
    return res.send(css);
  }

  setImmutableEmbedAssetCache(res);
  res.sendFile(filePath);
}

pageRouter.use("/assets", sendEmbedAsset);
pageRouter.use("/fonts", sendEmbedFont);
pageRouter.use("/mind-map", embedMindMapGate, sendEmbedMindMap);

pageRouter.get("/api/:fileId/data", (req, res) => {
  const token = getEmbedRequestToken(req);
  log.info("[DEBUG] embed.apiData | request start", {
    fileId: req.params.fileId?.slice(0, 8),
    hasToken: !!token,
    tokenLength: token ? String(token).length : 0,
    referer: req.get("referer") || null,
    origin: req.get("origin") || null,
  });
  const result = validateEmbedToken(req, token);
  if (!result.ok) {
    log.info("[DEBUG] embed.apiData | token rejected", {
      fileId: req.params.fileId?.slice(0, 8),
      status: result.status,
      error: result.error,
    });
    return res.status(result.status).json({ error: result.error });
  }

  const fileId = req.params.fileId;
  const fileRow = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
  if (!fileRow) {
    log.info("[DEBUG] embed.apiData | file row missing", {
      fileId: fileId.slice(0, 8),
    });
    return res.status(404).json({ error: "File not found" });
  }

  const fp = currentPath(fileId);
  if (!existsSync(fp)) {
    log.info("[DEBUG] embed.apiData | current file missing", {
      fileId: fileId.slice(0, 8),
      fp,
    });
    return res.status(404).json({ error: "File data missing" });
  }

  try {
    const raw = readFileSync(fp, "utf-8");
    const data = JSON.parse(raw);
    log.info("[DEBUG] embed.apiData | payload ready", {
      fileId: fileId.slice(0, 8),
      name: fileRow.name,
      dbKind: fileRow.kind || "excalidraw",
      bytes: raw.length,
      summary: summarizeEmbedData(data),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      id: fileId,
      name: fileRow.name,
      kind: fileRow.kind || "excalidraw",
      data,
    });
  } catch (error) {
    log.info("[DEBUG] embed.apiData | payload failed", {
      fileId: fileId.slice(0, 8),
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    res.status(500).json({ error: "Corrupt scene file" });
  }
});

// ---------------------------------------------------------------------------
// Embed page  (/embed/:fileId?token=xxx)
// ---------------------------------------------------------------------------

pageRouter.get("/:fileId", (req, res) => {
  log.info("[DEBUG] embed.page | request start", {
    fileId: req.params.fileId?.slice(0, 8),
    hasToken: !!req.query.token,
    tokenLength: req.query.token ? String(req.query.token).length : 0,
    referer: req.get("referer") || null,
    origin: req.get("origin") || null,
    host: req.get("host") || null,
  });
  const result = validateEmbedToken(req);
  if (!result.ok) {
    log.info("[DEBUG] embed.page | token rejected", {
      fileId: req.params.fileId?.slice(0, 8),
      status: result.status,
      error: result.error,
    });
    log.warn(`page rejected: ${result.error}`, {
      fileId: req.params.fileId?.slice(0, 8),
      ip: req.ip,
    });
    return res.status(result.status).send(errorPage(result.error));
  }

  const fileId = req.params.fileId;
  const tokenRow = result.row;
  const token = req.query.token;

  const fileRow = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
  if (!fileRow) {
    log.info("[DEBUG] embed.page | file row missing", {
      fileId: fileId.slice(0, 8),
    });
    return res.status(404).send(errorPage("File not found"));
  }

  const fp = currentPath(fileId);
  if (!existsSync(fp)) {
    log.info("[DEBUG] embed.page | current file missing", {
      fileId: fileId.slice(0, 8),
      fp,
    });
    return res.status(404).send(errorPage("File data missing"));
  }

  const indexPath = findEmbedIndexHtml();
  if (!indexPath) {
    log.info("[DEBUG] embed.page | index missing", {
      fileId: fileId.slice(0, 8),
    });
    return res
      .status(500)
      .send(errorPage("Embed build not found — cannot serve embed page"));
  }

  let html = readFileSync(indexPath, "utf-8");
  const encodedToken = encodeURIComponent(String(token));

  html = rewriteSpaAssetRefsForEmbed(html, encodedToken);

  // Intercept JS-level font/asset loads that still reference /fonts/ or /assets/
  const fontInterceptor = buildEmbedRuntimeAssetInterceptor(encodedToken);

  html = html.replace("<head>", `<head>\n${fontInterceptor}`);
  html = injectEmbedBootstrap(html, {
    fileId,
    fileName: fileRow.name,
    kind: fileRow.kind || "excalidraw",
    token: String(token),
  });
  log.info("[DEBUG] embed.page | bootstrap injected", {
    fileId: fileId.slice(0, 8),
    fileName: fileRow.name,
    kind: fileRow.kind || "excalidraw",
    indexPath,
    htmlLength: html.length,
    hasEmbedIndex: indexPath.includes("/embed/"),
    dataUrl: `/embed/api/${encodeURIComponent(fileId)}/data?_t=<redacted>`,
  });

  // Set embed cookie for subsequent asset/font requests from this iframe
  res.setHeader(
    "Set-Cookie",
    `__embed_t=${encodeURIComponent(token)}; Path=/embed; HttpOnly; Secure; SameSite=None; Max-Age=3600`,
  );

  const ancestors = buildFrameAncestors(tokenRow.allowed_domains);
  res.setHeader("Content-Security-Policy", `frame-ancestors ${ancestors}`);
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.removeHeader("X-Frame-Options");

  log.info("page served", {
    fileId: fileId.slice(0, 8),
    tokenId: tokenRow.id.slice(0, 8),
  });

  db.prepare(
    "UPDATE embed_tokens SET usage_count = usage_count + 1 WHERE id = ?",
  ).run(tokenRow.id);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

pageRouter.use((req, res) => {
  if (
    isTokenProtectedEmbedPath(req.path) &&
    !isTokenActive(getEmbedRequestToken(req))
  ) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  res.status(404).type("text/plain").send("Not found");
});

export { tokenRouter, pageRouter };
