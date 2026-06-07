/**
 * Embed HTTP routes — thin layer over embedAccess + static/asset helpers.
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import db, { DATA_DIR } from "../db.js";
import { createLogger } from "../lib/logger.js";
import {
  buildFrameAncestors,
  captureEmbeddingHostForSession,
  createMindMapEmbedGate,
  createRequireEmbedAccess,
  getEmbedRequestToken,
  getRequestHost,
  isSameOriginAdminRequest,
  isWildcardAllowedDomains,
  issueEmbedSessionCookies,
  parseAllowedDomainsInput,
  setPublicImmutableCacheHeaders,
  validateEmbedAccess,
} from "../lib/embedAccess.js";
import { createEmbedTokenActiveCache } from "../lib/embedTokenCache.js";
import {
  isAllowedMindMapEmbedAssetPath,
  rewriteMindMapCssForEmbed,
  rewriteMindMapHtmlForEmbed,
} from "../lib/embedMindMapAssets.js";
import { buildEmbedRuntimeAssetInterceptor } from "../lib/embedRuntimeAssets.js";
import { injectEmbedBootstrap } from "../lib/embedPageHtml.js";
import {
  formatDocumentEtag,
  ifNoneMatchSatisfied,
  sendNotModified,
} from "../lib/documentEtag.js";

const log = createLogger({ module: "embed" });

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN_SELECT =
  "id, token, file_id, allowed_domains, created_at, usage_count";

const tokenRouter = Router();
const pageRouter = Router();

const TOKEN_ACTIVE_CACHE_TTL_MS = 10_000;
const CONTENT_HASHED_ASSET_RE =
  /(?:^|\/)[^/]+\.[a-f0-9]{8,}\.(?:css|gif|ico|jpe?g|js|json|mjs|png|svg|webp|woff2?)$/i;

function setMindMapEmbedAssetCacheHeaders(res, assetPath) {
  if (CONTENT_HASHED_ASSET_RE.test(assetPath)) {
    setPublicImmutableCacheHeaders(res);
    return;
  }
  res.setHeader("Cache-Control", "public, no-cache, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

const embedTokenActiveCache = createEmbedTokenActiveCache({
  ttlMs: TOKEN_ACTIVE_CACHE_TTL_MS,
  now: () => Date.now(),
  lookup(token) {
    if (!token) {
      return false;
    }
    return !!db
      .prepare("SELECT id FROM embed_tokens WHERE token = ?")
      .get(token);
  },
});

function lookupEmbedToken(token, fileId) {
  if (!embedTokenActiveCache.isActive(token)) {
    return undefined;
  }
  return db
    .prepare(
      `SELECT ${TOKEN_SELECT} FROM embed_tokens WHERE token = ? AND file_id = ?`,
    )
    .get(token, fileId);
}

const requireEmbedAccess = createRequireEmbedAccess({
  lookupToken: lookupEmbedToken,
});

const requireEmbedAccessForFile = createRequireEmbedAccess({
  lookupToken: lookupEmbedToken,
  requireFileId: true,
});

const mindMapEmbedGate = createMindMapEmbedGate({ lookupToken: lookupEmbedToken });

function currentPath(fileId) {
  return join(DATA_DIR, "files", fileId, "current.excalidraw");
}

function summarizeEmbedData(data) {
  if (!data || typeof data !== "object") {
    return { type: data === null ? "null" : typeof data };
  }
  const inner =
    data.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : null;
  return {
    keys: Object.keys(data).slice(0, 12),
    kind: typeof data.kind === "string" ? data.kind : null,
    topElements: Array.isArray(data.elements) ? data.elements.length : null,
    dataRootChildren:
      inner && inner.root && Array.isArray(inner.root.children)
        ? inner.root.children.length
        : null,
  };
}

function requireSameOrigin(req, res, next) {
  if (!isSameOriginAdminRequest(req)) {
    return res.status(403).json({ error: "same_origin_required" });
  }
  next();
}

// ---------------------------------------------------------------------------
// Token management API  (/api/embed-tokens) — admin same-origin only
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

  log.info("token created", { id: id.slice(0, 8), fileId: fileId.slice(0, 8) });

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
// Static roots & path helpers
// ---------------------------------------------------------------------------

function findSpaIndexHtml() {
  const raw = (process.env.SERVE_SPA || "").trim();
  const defaultRoot = join(__dirname, "../../app/build");
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

function rewriteSpaAssetRefsForEmbed(html) {
  let out = html.replace(
    /((?:src|href)=["'])(?:\.\.\/|\.\/)?(?:\/)?assets\/([^"']+)(["'])/g,
    `$1/embed/assets/$2$3`,
  );
  out = out.replace(
    /((?:src|href)=["'])(?:\.\.\/|\.\/)?(?:\/)?fonts\/([^"']+)(["'])/g,
    `$1/embed/fonts/$2$3`,
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

function getAssetsRoot() {
  const idx = findSpaIndexHtml();
  if (idx) {
    return dirname(idx);
  }
  const fallback = "/var/www/excalidraw-static";
  return existsSync(fallback) ? fallback : null;
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
  if (!resolved.startsWith(baseResolved + "/")) {
    return null;
  }
  return resolved;
}

function routePath(req) {
  try {
    return decodeURIComponent(req.path.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

const _cssCache = new Map();


function sendEmbedAsset(req, res) {
  const root = getAssetsRoot();
  if (!root) {
    return res.status(500).type("text/plain").send("Assets not available");
  }

  const assetPath = routePath(req);
  if (!assetPath) {
    return res.status(400).type("text/plain").send("Bad request");
  }

  const filePath = safeJoin(join(root, "assets"), assetPath);
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).type("text/plain").send("Not found");
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
    const css = rawCss.replace(
      /url\((["']?)(?:\.\/)?(?:\/)?fonts\/([^)"']+)\1\)/g,
      `url($1/embed/fonts/$2$1)`,
    );
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    setPublicImmutableCacheHeaders(res);
    return res.send(css);
  }

  setPublicImmutableCacheHeaders(res);
  res.sendFile(filePath);
}

function sendEmbedFont(req, res) {
  const root = getAssetsRoot();
  if (!root) {
    return res.status(500).type("text/plain").send("Assets not available");
  }

  const fontPath = routePath(req);
  if (!fontPath) {
    return res.status(400).type("text/plain").send("Bad request");
  }

  const filePath = safeJoin(join(root, "fonts"), fontPath);
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).type("text/plain").send("Not found");
  }

  setPublicImmutableCacheHeaders(res);
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

  if (assetPath.endsWith(".html")) {
    const html = rewriteMindMapHtmlForEmbed(readFileSync(filePath, "utf-8"));
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
    const css = rewriteMindMapCssForEmbed(rawCss, assetPath);
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    setMindMapEmbedAssetCacheHeaders(res, assetPath);
    return res.send(css);
  }

  setMindMapEmbedAssetCacheHeaders(res, assetPath);
  res.sendFile(filePath);
}

function resolveSessionEmbeddingHost(req, accessResult) {
  let host =
    accessResult.embeddingHost || captureEmbeddingHostForSession(req);
  if (!host && isWildcardAllowedDomains(accessResult.row.allowed_domains)) {
    host = getRequestHost(req);
  }
  return host || getRequestHost(req);
}

// ---------------------------------------------------------------------------
// Embed public surface — all paths use requireEmbedAccess (domain → token)
// ---------------------------------------------------------------------------

pageRouter.get(
  "/api/:fileId/data",
  requireEmbedAccessForFile,
  (req, res) => {
    const fileId = req.params.fileId;
    const fileRow = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
    if (!fileRow) {
      return res.status(404).json({ error: "File not found" });
    }

    const fp = currentPath(fileId);
    if (!existsSync(fp)) {
      return res.status(404).json({ error: "File data missing" });
    }

    if (
      fileRow.content_sha256 &&
      ifNoneMatchSatisfied(req.get("if-none-match"), fileRow.content_sha256)
    ) {
      return sendNotModified(res, fileRow.content_sha256);
    }

    try {
      const raw = readFileSync(fp, "utf-8");
      const data = JSON.parse(raw);
      log.info("embed data served", {
        fileId: fileId.slice(0, 8),
        kind: fileRow.kind || "excalidraw",
        summary: summarizeEmbedData(data),
      });
      res.setHeader("Cache-Control", "no-store");
      const etag = formatDocumentEtag(fileRow.content_sha256);
      if (etag) {
        res.setHeader("ETag", etag);
      }
      res.json({
        id: fileId,
        name: fileRow.name,
        kind: fileRow.kind || "excalidraw",
        data,
      });
    } catch (error) {
      log.warn("embed data corrupt", {
        fileId: fileId.slice(0, 8),
        message: error?.message,
      });
      res.status(500).json({ error: "Corrupt scene file" });
    }
  },
);

// Hashed chunks: public (import() / lazy() do not carry embed cookies or full Referer).
pageRouter.use("/assets", sendEmbedAsset);
pageRouter.use("/fonts", sendEmbedFont);
pageRouter.use("/mind-map", mindMapEmbedGate, sendEmbedMindMap);

pageRouter.get("/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const token = getEmbedRequestToken(req);
  const result = validateEmbedAccess(req, {
    fileId,
    token,
    lookupToken: lookupEmbedToken,
  });

  if (!result.ok) {
    log.warn(`embed page rejected: ${result.error}`, {
      fileId: fileId.slice(0, 8),
      ip: req.ip,
    });
    return res.status(result.status).send(errorPage(result.error));
  }

  const fileRow = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
  if (!fileRow) {
    return res.status(404).send(errorPage("File not found"));
  }

  const fp = currentPath(fileId);
  if (!existsSync(fp)) {
    return res.status(404).send(errorPage("File data missing"));
  }

  const indexPath = findEmbedIndexHtml();
  if (!indexPath) {
    return res
      .status(500)
      .send(errorPage("Embed build not found — cannot serve embed page"));
  }

  const tokenValue = String(token);
  let html = readFileSync(indexPath, "utf-8");
  html = rewriteSpaAssetRefsForEmbed(html);
  html = html.replace(
    "<head>",
    `<head>\n${buildEmbedRuntimeAssetInterceptor()}`,
  );
  html = injectEmbedBootstrap(html, {
    fileId,
    fileName: fileRow.name,
    kind: fileRow.kind || "excalidraw",
    token: tokenValue,
  });

  const sessionHost = resolveSessionEmbeddingHost(req, result);
  issueEmbedSessionCookies(res, {
    token: tokenValue,
    tokenId: result.row.id,
    fileId,
    embeddingHost: sessionHost,
  });

  res.setHeader(
    "Content-Security-Policy",
    `frame-ancestors ${buildFrameAncestors(result.row.allowed_domains)}`,
  );
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.removeHeader("X-Frame-Options");

  db.prepare(
    "UPDATE embed_tokens SET usage_count = usage_count + 1 WHERE id = ?",
  ).run(result.row.id);

  log.info("embed page served", {
    fileId: fileId.slice(0, 8),
    tokenId: result.row.id.slice(0, 8),
    embeddingHost: sessionHost,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

pageRouter.use((_req, res) => {
  res.status(404).type("text/plain").send("Not found");
});

export { tokenRouter, pageRouter };
