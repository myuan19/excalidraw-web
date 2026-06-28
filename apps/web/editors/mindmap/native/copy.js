import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const nativeDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(nativeDir, "../../../../../");
const distDir = path.join(nativeDir, "dist");
const servedDir = path.join(repoRoot, "public/mind-map");
const indexDest = path.join(nativeDir, "index.html");
const indexSrc = path.join(distDir, "index.html");
const webDistIndex = path.join(nativeDir, "web/dist/index.html");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

const PRECOMPRESS_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt",
]);

function shouldPrecompress(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!PRECOMPRESS_EXTENSIONS.has(ext)) {
    return false;
  }
  try {
    return fs.statSync(filePath).size >= 1024;
  } catch {
    return false;
  }
}

function gzipFile(filePath) {
  if (!shouldPrecompress(filePath)) {
    return;
  }
  const source = fs.readFileSync(filePath);
  const compressed = zlib.gzipSync(source, { level: 9 });
  fs.writeFileSync(`${filePath}.gz`, compressed);
}

function gzipDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      gzipDir(filePath);
    } else if (!entry.name.endsWith(".gz")) {
      gzipFile(filePath);
    }
  }
}

function findHashedFile(dir, prefix, ext) {
  if (!fs.existsSync(dir)) {
    return null;
  }
  return (
    fs
      .readdirSync(dir)
      .find((name) => name.startsWith(`${prefix}.`) && name.endsWith(ext)) ??
    null
  );
}

function refreshMindMapIndexBundles(html) {
  const jsDir = path.join(distDir, "js");
  const cssDir = path.join(distDir, "css");
  const appJs = findHashedFile(jsDir, "app", ".js");
  const vendorsJs = findHashedFile(jsDir, "chunk-vendors", ".js");
  const appCss = findHashedFile(cssDir, "app", ".css");
  const vendorsCss = findHashedFile(cssDir, "chunk-vendors", ".css");

  let next = html;
  if (appJs) {
    next = next.replace(
      /src=(["'])dist\/js\/app\.[^"']+\.js\1/g,
      `src=$1dist/js/${appJs}$1`,
    );
  }
  if (vendorsJs) {
    next = next.replace(
      /src=(["'])dist\/js\/chunk-vendors\.[^"']+\.js\1/g,
      `src=$1dist/js/${vendorsJs}$1`,
    );
  }
  if (appCss) {
    next = next.replace(
      /href=(["'])dist\/css\/app\.[^"']+\.css\1/g,
      `href=$1dist/css/${appCss}$1`,
    );
  }
  if (vendorsCss) {
    next = next.replace(
      /href=(["'])dist\/css\/chunk-vendors\.[^"']+\.css\1/g,
      `href=$1dist/css/${vendorsCss}$1`,
    );
  }
  return next;
}

function resolveIndexSource() {
  if (fs.existsSync(indexSrc)) {
    return { path: indexSrc, reusedExistingShell: false };
  }
  if (fs.existsSync(indexDest)) {
    console.warn(
      "[mindmap-copy] dist/index.html missing; reusing native/index.html (incremental vue build)",
    );
    return { path: indexDest, reusedExistingShell: true };
  }
  if (fs.existsSync(webDistIndex)) {
    console.warn(
      "[mindmap-copy] dist/index.html missing; falling back to web/dist/index.html",
    );
    return { path: webDistIndex, reusedExistingShell: true };
  }
  throw new Error(
    `MindMap vue build not found: ${indexSrc} (no native/index.html fallback)`,
  );
}

const jsDir = path.join(distDir, "js");
if (!fs.existsSync(jsDir) || !findHashedFile(jsDir, "app", ".js")) {
  throw new Error(
    `MindMap vue build assets not found under ${jsDir} (run vue-cli-service build first)`,
  );
}

const { path: resolvedIndexSrc, reusedExistingShell } = resolveIndexSource();
let html = fs.readFileSync(resolvedIndexSrc, "utf8");
if (reusedExistingShell) {
  html = refreshMindMapIndexBundles(html);
}

if (fs.existsSync(servedDir)) {
  fs.rmSync(servedDir, { recursive: true, force: true });
}
fs.mkdirSync(servedDir, { recursive: true });
copyDir(distDir, path.join(servedDir, "dist"));

const bridgeSrc = path.join(nativeDir, "web/src/bridge/takeoverShell.js");
const bridgeTargets = [
  path.join(servedDir, "dist/bridge/takeover-shell.js"),
  path.join(distDir, "bridge/takeover-shell.js"),
];
if (fs.existsSync(bridgeSrc)) {
  for (const target of bridgeTargets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(bridgeSrc, target);
    gzipFile(target);
  }
} else {
  console.warn("[mindmap-copy] missing bridge source:", bridgeSrc);
}

try {
  const { normalizeMindMapIndexHtml } = await import(
    pathToFileURL(
      path.join(repoRoot, "scripts/mind-map-webpack-chunks.mjs"),
    ).href
  );
  html = normalizeMindMapIndexHtml(html);
} catch (error) {
  console.warn(
    "[mindmap-copy] index.html normalize skipped:",
    error instanceof Error ? error.message : String(error),
  );
}

fs.writeFileSync(path.join(servedDir, "index.html"), html);
fs.writeFileSync(indexDest, html);
fs.writeFileSync(indexSrc, html);
gzipDir(distDir);
gzipDir(path.join(servedDir, "dist"));

console.log(`[mindmap-copy] synced ${path.relative(repoRoot, servedDir)}`);
