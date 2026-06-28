#!/usr/bin/env node
/**
 * Bake desktop pack flags into src/desktopBuildFlags.json before electron-builder.
 *
 * Set EDITORHUB_DESKTOP_DEBUG_PACK=1 for a debug installer/portable that enables
 * client + server diagnostics without manual env vars at launch.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function envFlagOn(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

const debugPack = envFlagOn(process.env.EDITORHUB_DESKTOP_DEBUG_PACK);
const flagsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/desktopBuildFlags.json",
);

const payload = {
  debugPack,
  builtAt: new Date().toISOString(),
};

writeFileSync(flagsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `[write-build-flags] wrote ${flagsPath} (debugPack=${debugPack})`,
);
