import { Router } from "express";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import db, { DATA_DIR } from "../db.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger({ module: "embed" });

const __dirname = dirname(fileURLToPath(import.meta.url));

const tokenRouter = Router();
const pageRouter = Router();
const TOKEN_SELECT =
  "id, token, file_id, allowed_domains, created_at, usage_count";

function currentPath(fileId) {
  return join(DATA_DIR, "files", fileId, "current.excalidraw");
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
  const forwardedHost = req.get("x-forwarded-host");
  const rawHost = forwardedHost || req.get("host") || "";
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
  db.prepare("DELETE FROM embed_tokens WHERE id = ?").run(req.params.id);
  log.info("token deleted", { id: req.params.id.slice(0, 8) });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Embed page  (/embed/:fileId?token=xxx)
//
// Strategy: read the SPA's built index.html, inject scene data + embed flag
// so the same React bundle renders in embed mode — no separate build needed.
// ---------------------------------------------------------------------------

function validateEmbedToken(req) {
  const token = req.query.token;
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
  if (!allowedDomains || allowedDomains === "*") {
    return "*";
  }
  const hosts = allowedDomains
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
  if (hosts.length === 0) {
    return "*";
  }
  return hosts.map((h) => `https://${h} http://${h}`).join(" ");
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

function isTokenActive(token) {
  if (!token) return false;
  const row = db
    .prepare("SELECT id FROM embed_tokens WHERE token = ?")
    .get(token);
  if (!row) return false;
  return true;
}

function embedAssetGate(req, res, next) {
  const token = getEmbedRequestToken(req);
  if (!isTokenActive(token)) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  next();
}

function getAssetsRoot() {
  const idx = findSpaIndexHtml();
  if (idx) return dirname(idx);
  const fallback = "/var/www/excalidraw-static";
  if (existsSync(fallback)) return fallback;
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
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(css);
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
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

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath);
}

pageRouter.use("/assets", embedAssetGate, sendEmbedAsset);
pageRouter.use("/fonts", embedAssetGate, sendEmbedFont);

// ---------------------------------------------------------------------------
// Embed page  (/embed/:fileId?token=xxx)
// ---------------------------------------------------------------------------

pageRouter.get("/:fileId", (req, res) => {
  const result = validateEmbedToken(req);
  if (!result.ok) {
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
    return res.status(404).send(errorPage("File not found"));
  }

  const fp = currentPath(fileId);
  if (!existsSync(fp)) {
    return res.status(404).send(errorPage("File data missing"));
  }

  let sceneJson;
  try {
    sceneJson = readFileSync(fp, "utf-8");
    JSON.parse(sceneJson);
  } catch {
    return res.status(500).send(errorPage("Corrupt scene file"));
  }

  const indexPath = findSpaIndexHtml();
  if (!indexPath) {
    return res
      .status(500)
      .send(errorPage("SPA build not found — cannot serve embed page"));
  }

  let html = readFileSync(indexPath, "utf-8");
  const encodedToken = encodeURIComponent(String(token));

  // ── rewrite asset / font paths to token-gated embed routes ──
  // Vite `base: "./"` produces `"./assets/…"` (relative), but deployments
  // with `VITE_BASE_PATH=/` produce `"/assets/…"` (absolute).  Handle both.
  html = html.replace(
    /((?:src|href)=["'])(?:\.\/)?(?:\/)?assets\/([^"']+)(["'])/g,
    `$1/embed/assets/$2?_t=${encodedToken}$3`,
  );
  html = html.replace(
    /((?:src|href)=["'])(?:\.\/)?(?:\/)?fonts\/([^"']+)(["'])/g,
    `$1/embed/fonts/$2?_t=${encodedToken}$3`,
  );

  // Intercept JS-level font/asset loads that still reference /fonts/ or /assets/
  const fontInterceptor = `<script>
(function(){
  var remap=function(u){
    return typeof u==='string'?u.replace(/^(?:\\.?\\/)?(?=fonts\\/|assets\\/)/,'/embed/'):u;
  };
  var _f=window.fetch;
  window.fetch=function(u,o){return _f.call(this,remap(u),o);};
  if(window.FontFace){var _FF=window.FontFace;window.FontFace=function(f,s,d){return new _FF(f,remap(s),d);};window.FontFace.prototype=_FF.prototype;}
})();
</script>`;

  const embedScript = `<script>
window.__EXCALIDRAW_EMBED_MODE__ = true;
window.__EXCALIDRAW_EMBED_FILE_ID__ = ${JSON.stringify(fileId)};
window.__EXCALIDRAW_EMBED_FILE_NAME__ = ${JSON.stringify(fileRow.name)};
window.__EXCALIDRAW_EMBED_DATA__ = ${escapeForScript(sceneJson)};
</script>`;

  html = html.replace("<head>", `<head>\n${fontInterceptor}`);
  html = html.replace("</head>", `${embedScript}\n</head>`);

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
  if (!isTokenActive(getEmbedRequestToken(req))) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  res.status(404).type("text/plain").send("Not found");
});

export { tokenRouter, pageRouter };
