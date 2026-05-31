#!/usr/bin/env node
/**
 * Ensures public/mind-map/ is a complete bridge build before app/vite packaging.
 * Run automatically from scripts/build-production.sh after MindMap vue build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  findMindMapAppBundle,
  listWebpackLazyChunks,
} from "./mind-map-webpack-chunks.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveMindMapDir() {
  const args = process.argv.slice(2);
  const rootFlag = args.findIndex((a) => a === "--root" || a === "-r");
  if (rootFlag >= 0 && args[rootFlag + 1]) {
    const custom = args[rootFlag + 1];
    return path.isAbsolute(custom)
      ? custom
      : path.join(repoRoot, custom);
  }
  if (process.env.MIND_MAP_VERIFY_ROOT) {
    const custom = process.env.MIND_MAP_VERIFY_ROOT;
    return path.isAbsolute(custom)
      ? custom
      : path.join(repoRoot, custom);
  }
  return path.join(repoRoot, "public/mind-map");
}

const mindMapDir = resolveMindMapDir();
const root = repoRoot;
const indexPath = path.join(mindMapDir, "index.html");
const distJsDir = path.join(mindMapDir, "dist/js");

const LARGE_CHUNK_WARN_BYTES = 2 * 1024 * 1024;

function fail(message) {
  console.error(`[verify-mind-map] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  fail(
    `missing ${path.relative(root, indexPath)} — run: bash scripts/build-production.sh mindmap`,
  );
}

let html = fs.readFileSync(indexPath, "utf8");

if (html.includes('rel="preload"') && /href="dist\/(?:js|css)\//.test(html)) {
  fail(
    "index.html must not contain <link rel=\"preload\"> for dist/* (causes credentials mismatch / double fetch). Rebuild mind-map and run copy.js (normalizeMindMapIndexHtml).",
  );
}

if (/dist\/(?:js|css)\/[^"']+\.[a-f0-9]+\.(?:js|css)\?[a-f0-9]{8,}/i.test(html)) {
  fail(
    "index.html must not append html-webpack ?hash query on content-hashed dist assets (breaks immutable cache). Set html.hash=false in vue.config.js and rebuild.",
  );
}

const bridgeShellPath = path.join(mindMapDir, "dist/bridge/takeover-shell.js");

if (!html.includes('src="dist/bridge/takeover-shell.js"')) {
  fail(
    'index.html must load dist/bridge/takeover-shell.js before vue bundles (see native/web/public/index.html)',
  );
}

if (!fs.existsSync(bridgeShellPath)) {
  fail(
    `missing ${path.relative(root, bridgeShellPath)} — sync native/web/src/bridge/takeoverShell.js via copy.js`,
  );
}

const bridgeShell = fs.readFileSync(bridgeShellPath, "utf8");
const requiredMarkers = [
  "simple-mind-map-native",
  "window.takeOverApp",
  "startTakeOverApp",
  "postToHost('ready')",
  "postToHost('appInited')",
  "host_restore_preview_view",
  "isRuntimeReady",
];

for (const marker of requiredMarkers) {
  if (!bridgeShell.includes(marker)) {
    fail(
      `takeover-shell.js is not a bridge runtime (missing "${marker}"). Rebuild MindMap native/web and sync public/mind-map/.`,
    );
  }
}

const scriptSrcs = [
  ...html.matchAll(/\bsrc="(dist\/[^"?]+\.js)(?:\?[^"]*)?"/g),
].map((match) => match[1]);

if (scriptSrcs.length === 0) {
  fail("index.html has no dist/*.js script tags");
}

for (const rel of scriptSrcs) {
  const abs = path.join(mindMapDir, rel);
  if (!fs.existsSync(abs)) {
    fail(
      `stale index.html references missing ${rel} — run: bash scripts/build-production.sh mindmap`,
    );
  }
}

if (!fs.existsSync(distJsDir)) {
  fail("missing public/mind-map/dist/js/");
}

const appBundle = findMindMapAppBundle(distJsDir);
if (!appBundle) {
  fail("missing public/mind-map/dist/js/app.[hash].js");
}

const lazyChunks = listWebpackLazyChunks(distJsDir);
if (lazyChunks.length === 0) {
  fail(
    `cannot parse lazy chunk manifest from ${appBundle} — vue build output looks broken`,
  );
}

for (const chunk of lazyChunks) {
  const abs = path.join(distJsDir, chunk.file);
  if (!fs.existsSync(abs)) {
    fail(
      `app bundle references missing ${chunk.rel} — deploy/sync entire public/mind-map/dist/js/ atomically`,
    );
  }
  if (chunk.bytes >= LARGE_CHUNK_WARN_BYTES) {
    console.warn(
      `[verify-mind-map] warn: ${chunk.rel} is ${(chunk.bytes / 1024 / 1024).toFixed(1)}MB — ensure reverse proxy allows large static JS (no auth redirect, HTTP/2 stable)`,
    );
  }
}

const label = path.relative(root, mindMapDir) || mindMapDir;
console.log(
  `[verify-mind-map] ok — ${label}/index.html (${scriptSrcs.length} scripts, ${lazyChunks.length} lazy chunks via ${appBundle})`,
);
