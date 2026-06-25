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

if (!fs.existsSync(indexSrc)) {
  throw new Error(`MindMap vue build not found: ${indexSrc}`);
}

if (fs.existsSync(indexDest)) {
  fs.unlinkSync(indexDest);
}
fs.copyFileSync(indexSrc, indexDest);
fs.unlinkSync(indexSrc);

if (fs.existsSync(servedDir)) {
  fs.rmSync(servedDir, { recursive: true, force: true });
}
fs.mkdirSync(servedDir, { recursive: true });
copyDir(distDir, path.join(servedDir, "dist"));

const bridgeSrc = path.join(nativeDir, "web/src/bridge/takeoverShell.js");
const bridgeTargets = [
  path.join(servedDir, "dist/bridge/takeover-shell.js"),
  path.join(distDir, "dist/bridge/takeover-shell.js"),
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

let html = fs.readFileSync(indexDest, "utf8");
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
gzipDir(distDir);
gzipDir(path.join(servedDir, "dist"));

console.log(`[mindmap-copy] synced ${path.relative(repoRoot, servedDir)}`);
