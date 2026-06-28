#!/usr/bin/env node
/**
 * Cross-platform desktop dist helper (Windows-friendly).
 *
 *   node scripts/build-desktop-dist.mjs          # release pack
 *   node scripts/build-desktop-dist.mjs --debug  # debug pack
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const debug = process.argv.includes("--debug");

if (debug) {
  process.env.EDITORHUB_DESKTOP_DEBUG_PACK = "1";
  process.env.VITE_APP_DEPLOY_DEBUG = "true";
} else {
  delete process.env.EDITORHUB_DESKTOP_DEBUG_PACK;
  delete process.env.VITE_APP_DEPLOY_DEBUG;
}

function run(label, command, args, options = {}) {
  console.log(`[build-desktop-dist] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function prepareRuntime() {
  const runtimeDir = path.join(repoRoot, "apps", "desktop", ".runtime");
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  cpSync(path.join(repoRoot, "server"), path.join(runtimeDir, "server"), {
    recursive: true,
  });
  cpSync(path.join(repoRoot, "lib"), path.join(runtimeDir, "lib"), {
    recursive: true,
  });
  rmSync(path.join(runtimeDir, "server", "node_modules"), {
    recursive: true,
    force: true,
  });
  rmSync(path.join(runtimeDir, "server", "data"), {
    recursive: true,
    force: true,
  });
}

run("sync icon", "node", ["apps/desktop/scripts/sync-app-icon.mjs"]);

function runWebAppBuild() {
  if (debug) {
    run("verify mind-map public", "node", ["scripts/verify-mind-map-public.mjs"]);
    run("build web app (debug)", "yarn", ["build:app-only"], {
      cwd: path.join(repoRoot, "apps", "web"),
      env: {
        VITE_APP_DEPLOY_DEBUG: "true",
      },
    });
    run("build web version (debug)", "yarn", ["build:version"], {
      cwd: path.join(repoRoot, "apps", "web"),
    });
    run("verify mind-map in app build", "node", [
      "scripts/verify-mind-map-public.mjs",
      "--root",
      "apps/web/build/mind-map",
    ]);
    return;
  }
  if (!existsSync(path.join(repoRoot, "apps", "web", "build", "index.html"))) {
    run("build web", "bash", ["scripts/build-production.sh", "app"]);
  }
}

runWebAppBuild();

run("verify desktop entry", "node", ["scripts/verify-desktop-entry.mjs"]);
run("write build flags", "node", ["apps/desktop/scripts/write-build-flags.mjs"]);
run("ensure outputs unlocked", "node", ["scripts/ensure-desktop-pack-unlocked.mjs"]);

prepareRuntime();

const distScript = debug ? "dist:debug" : "dist";
run(`electron-builder (${distScript})`, "yarn", ["--cwd", "apps/desktop", distScript]);

console.log(
  `[build-desktop-dist] done (${debug ? "debug pack" : "release pack"})`,
);
