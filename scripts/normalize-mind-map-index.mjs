#!/usr/bin/env node
/**
 * Normalize mind-map index.html in public/ and native/ (strip ?hash, remove preloads).
 * Prefer full rebuild: bash scripts/build-production.sh mindmap
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeMindMapIndexHtml } from "./mind-map-webpack-chunks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  path.join(root, "public/mind-map/index.html"),
  path.join(root, "app/editors/mindmap/native/index.html"),
];

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`[normalize-mind-map-index] skip missing ${path.relative(root, file)}`);
    continue;
  }
  const before = fs.readFileSync(file, "utf8");
  const after = normalizeMindMapIndexHtml(before);
  if (after === before) {
    console.log(`[normalize-mind-map-index] ok (unchanged) ${path.relative(root, file)}`);
  } else {
    fs.writeFileSync(file, after);
    console.log(`[normalize-mind-map-index] updated ${path.relative(root, file)}`);
  }
}
