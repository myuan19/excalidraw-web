import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { Router } from "express";
import db, { DATA_DIR } from "../db.js";
import {
  isAllowedMindMapEmbedAssetPath,
  rewriteMindMapCssForEmbed,
  rewriteMindMapHtmlForEmbed,
} from "../lib/embedMindMapAssets.js";
import { embedTokenActiveCache } from "../lib/embedActiveTokenCache.js";
import { buildEmbedRuntimeAssetInterceptor } from "../lib/embedRuntimeAssets.js";
import { isDomainAllowed } from "../lib/embedDomain.js";

const router = Router();
const cssCache = new Map();

function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

function validateEmbedRequest(req) {
  const token = getEmbedRequestToken(req);
  if (!token) {
    return { ok: false, status: 403, error: "missing_token" };
  }
  const row = db
    .prepare("SELECT * FROM embed_tokens WHERE token = ? AND file_id = ?")
    .get(token, req.params.fileId);
  if (!row) {
    return { ok: false, status: 403, error: "invalid_token" };
  }
  if (!isDomainAllowed(row.allowed_domains, req)) {
    return { ok: false, status: 403, error: "domain_not_allowed" };
  }
  return { ok: true, token: row };
}

function getEmbedCookie(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)__embed_t=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getEmbedRefererToken(req) {
  const referer = req.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.searchParams.get("_t") || url.searchParams.get("token");
  } catch {
    return null;
  }
}

function getEmbedRequestToken(req) {
  return String(req.query.token || req.query._t || getEmbedCookie(req) || getEmbedRefererToken(req) || "");
}

function getDistRoot() {
  const serveSpa = (process.env.SERVE_SPA || "").trim();
  const candidates = [
    serveSpa && serveSpa !== "1" && serveSpa !== "true"
      ? resolve(process.cwd(), serveSpa)
      : null,
    resolve(process.cwd(), "dist"),
    "/var/www/excalidraw-static",
  ].filter(Boolean);
  return candidates.find((root) => existsSync(join(root, "index.html"))) || null;
}

function getMindMapRoot() {
  const publicRoot = resolve(process.cwd(), "public", "mind-map");
  if (existsSync(join(publicRoot, "index.html"))) return publicRoot;
  const buildRoot = resolve(process.cwd(), "dist", "mind-map");
  if (existsSync(join(buildRoot, "index.html"))) return buildRoot;
  return null;
}

function safeJoin(root, relativePath) {
  const target = resolve(root, relativePath);
  return target === root || target.startsWith(`${root}/`) ? target : null;
}

function routePath(req) {
  try {
    return decodeURIComponent(req.path.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

function setImmutableEmbedAssetCache(res) {
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function gateEmbedAsset(req, res, next) {
  const token = getEmbedRequestToken(req);
  if (embedTokenActiveCache.isActive(token)) return next();
  return res.status(403).type("text/plain").send("Forbidden");
}

function sendEmbedAsset(req, res) {
  const root = getDistRoot();
  if (!root) return res.status(500).type("text/plain").send("Build assets not available");
  const assetPath = routePath(req);
  if (!assetPath) return res.status(400).type("text/plain").send("Bad request");
  const filePath = safeJoin(join(root, "assets"), assetPath);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).type("text/plain").send("Not found");
  }
  const encodedToken = encodeURIComponent(getEmbedRequestToken(req));
  if (filePath.endsWith(".css")) {
    const stat = statSync(filePath);
    const cached = cssCache.get(filePath);
    const rawCss =
      cached && cached.mtimeMs === stat.mtimeMs
        ? cached.content
        : readFileSync(filePath, "utf-8");
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      cssCache.set(filePath, { mtimeMs: stat.mtimeMs, content: rawCss });
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
  return res.sendFile(filePath);
}

function sendEmbedFont(req, res) {
  const root = getDistRoot();
  if (!root) return res.status(500).type("text/plain").send("Build assets not available");
  const fontPath = routePath(req);
  if (!fontPath) return res.status(400).type("text/plain").send("Bad request");
  const filePath =
    safeJoin(join(root, "fonts"), fontPath) ??
    safeJoin(join(root, "assets"), fontPath);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).type("text/plain").send("Not found");
  }
  setImmutableEmbedAssetCache(res);
  return res.sendFile(filePath);
}

function sendEmbedMindMap(req, res) {
  const root = getMindMapRoot();
  if (!root) return res.status(500).type("text/plain").send("MindMap assets not available");
  const assetPath = (req.path === "/" ? "index.html" : routePath(req)) || "index.html";
  if (!isAllowedMindMapEmbedAssetPath(assetPath)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  const filePath = safeJoin(root, assetPath);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).type("text/plain").send("Not found");
  }
  const encodedToken = encodeURIComponent(getEmbedRequestToken(req));
  if (assetPath === "index.html") {
    const html = rewriteMindMapHtmlForEmbed(readFileSync(filePath, "utf-8"), encodedToken);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(html);
  }
  if (assetPath.endsWith(".css")) {
    const css = rewriteMindMapCssForEmbed(readFileSync(filePath, "utf-8"), assetPath, encodedToken);
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    setImmutableEmbedAssetCache(res);
    return res.send(css);
  }
  setImmutableEmbedAssetCache(res);
  return res.sendFile(filePath);
}

router.use("/assets", gateEmbedAsset, sendEmbedAsset);
router.use("/fonts", gateEmbedAsset, sendEmbedFont);
router.use("/mind-map", gateEmbedAsset, sendEmbedMindMap);

function currentPath(fileId) {
  return join(DATA_DIR, "files", fileId, "current.excalidraw");
}

function readEmbedData(fileId) {
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
  if (!file) return null;
  const dataPath = currentPath(fileId);
  const data = existsSync(dataPath)
    ? JSON.parse(readFileSync(dataPath, "utf-8"))
    : null;
  return {
    file: {
      id: file.id,
      name: file.name,
      kind: file.kind,
      updated_at: file.updated_at,
      content_sha256: file.content_sha256,
    },
    id: file.id,
    name: file.name,
    kind: file.kind,
    updated_at: file.updated_at,
    content_sha256: file.content_sha256,
    data,
  };
}

router.get("/api/:fileId/data", (req, res) => {
  const validation = validateEmbedRequest(req);
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }
  const payload = readEmbedData(req.params.fileId);
  if (!payload) return res.status(404).json({ error: "file_not_found" });
  db.prepare("UPDATE embed_tokens SET usage_count = usage_count + 1 WHERE id = ?").run(
    validation.token.id,
  );
  res.json(payload);
});

router.get("/:fileId", (req, res) => {
  const validation = validateEmbedRequest(req);
  if (!validation.ok) {
    return res.status(validation.status).send(validation.error);
  }
  const payload = readEmbedData(req.params.fileId);
  if (!payload) return res.status(404).send("file_not_found");

  const token = getEmbedRequestToken(req);
  const bootstrap = JSON.stringify({
    mode: "embed",
    fileId: req.params.fileId,
    token,
    payload,
  }).replace(/</g, "\\u003c");

  const distIndex = join(process.cwd(), "dist", "index.html");
  if (existsSync(distIndex)) {
    const encodedToken = encodeURIComponent(token);
    const html = readFileSync(distIndex, "utf-8")
      .replace(
        /((?:src|href)=["'])(?:\.\/)?(?:\/)?assets\/([^"']+)(["'])/g,
        `$1/embed/assets/$2?_t=${encodedToken}$3`,
      )
      .replace(
        /((?:src|href)=["'])(?:\.\/)?(?:\/)?fonts\/([^"']+)(["'])/g,
        `$1/embed/fonts/$2?_t=${encodedToken}$3`,
      )
      .replace(
      "</head>",
      `<script>window.__EXCALIDRAW_WEB_EMBED__=${bootstrap};</script>${buildEmbedRuntimeAssetInterceptor(encodedToken)}</head>`,
    );
    res.setHeader(
      "Set-Cookie",
      `__embed_t=${encodedToken}; Path=/embed; HttpOnly; SameSite=Lax; Max-Age=3600`,
    );
    res.setHeader("Content-Security-Policy", `frame-ancestors ${buildFrameAncestors(validation.token.allowed_domains)}`);
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.removeHeader("X-Frame-Options");
    db.prepare("UPDATE embed_tokens SET usage_count = usage_count + 1 WHERE id = ?").run(
      validation.token.id,
    );
    return res.type("html").send(html);
  }

  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${payload.file.name}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
      header { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: white; }
      pre { margin: 16px; padding: 16px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: white; }
    </style>
  </head>
  <body>
    <header><strong>${payload.file.name}</strong><span> readonly embed</span></header>
    <pre>${JSON.stringify(payload.data, null, 2).replace(/</g, "&lt;")}</pre>
  </body>
</html>`);
});

function buildFrameAncestors(allowedDomains) {
  const extensionSchemes = "chrome-extension: moz-extension:";
  if (!allowedDomains || allowedDomains.trim() === "*") {
    return `* ${extensionSchemes}`;
  }
  const domains = allowedDomains
    .split(",")
    .map((domain) => normalizeHost(domain))
    .filter(Boolean)
    .flatMap((domain) => [`https://${domain}`, `http://${domain}`, `https://*.${domain}`, `http://*.${domain}`]);
  return ["'self'", ...domains, extensionSchemes].join(" ");
}

export default router;
