#!/usr/bin/env node
/**
 * Desktop packaging preflight: load Node-safe modules and check Electron entry files.
 * Do not import editorHubProtocol.mjs here — it requires the Electron runtime.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requireFile(relativePath) {
  const abs = path.join(repoRoot, relativePath);
  if (!existsSync(abs)) {
    throw new Error(`missing ${relativePath}`);
  }
  return abs;
}

await import(pathToFileURL(path.join(repoRoot, "apps/desktop/src/config.mjs")).href);
await import(
  pathToFileURL(path.join(repoRoot, "apps/desktop/src/bootstrapBackend.mjs")).href,
);

const electronEntryFiles = [
  "apps/desktop/electron/main.mjs",
  "apps/desktop/electron/preload.mjs",
  "apps/desktop/src/editorHubProtocol.mjs",
];

for (const relativePath of electronEntryFiles) {
  requireFile(relativePath);
}

const protocolSource = readFileSync(
  requireFile("apps/desktop/src/editorHubProtocol.mjs"),
  "utf8",
);
for (const marker of [
  "registerEditorHubPrivileges",
  "registerEditorHubProtocol",
  "EDITORHUB_APP_INDEX_URL",
]) {
  if (!protocolSource.includes(marker)) {
    throw new Error(
      `apps/desktop/src/editorHubProtocol.mjs missing expected export marker: ${marker}`,
    );
  }
}

console.log("[verify-desktop-entry] ok");
