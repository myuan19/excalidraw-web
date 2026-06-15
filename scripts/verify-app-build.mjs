#!/usr/bin/env node
/**
 * Verify host SPA build before Docker PREBUILT packaging.
 * Catches missing /icons/* and index.html → /assets/* chunk mismatches.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.resolve(
  process.argv.includes("--root")
    ? process.argv[process.argv.indexOf("--root") + 1]
    : path.join(root, "apps/web/build"),
);

function fail(msg) {
  console.error(`[verify-app-build] ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify-app-build] ${msg}`);
}

if (!fs.existsSync(path.join(buildRoot, "index.html"))) {
  fail(`missing ${buildRoot}/index.html`);
}

for (const name of [
  "icons/drawing-space.svg",
  "icons/excalidraw.svg",
  "icons/mindmap.ico",
]) {
  const p = path.join(buildRoot, name);
  if (!fs.statSync(p).isFile()) {
    fail(`missing ${p}`);
  }
}
ok("icons: drawing-space.svg, excalidraw.svg, mindmap.ico");

const indexHtml = fs.readFileSync(path.join(buildRoot, "index.html"), "utf8");
const assetRefs = [
  ...indexHtml.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g),
].map((m) => m[0].slice(1));

const unique = [...new Set(assetRefs)];
const missing = unique.filter(
  (rel) => !fs.existsSync(path.join(buildRoot, rel)),
);
if (missing.length > 0) {
  fail(
    `index.html references missing assets (stale/partial build):\n  ${missing
      .slice(0, 8)
      .join("\n  ")}${
      missing.length > 8 ? `\n  … +${missing.length - 8} more` : ""
    }`,
  );
}
ok(`index.html asset refs: ${unique.length} present`);

if (!fs.existsSync(path.join(buildRoot, "build-meta.json"))) {
  fail(
    `missing ${buildRoot}/build-meta.json (run yarn build:version after vite build)`,
  );
}
ok("build-meta.json present");
