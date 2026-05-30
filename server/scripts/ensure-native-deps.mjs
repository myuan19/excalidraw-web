#!/usr/bin/env node
/**
 * Ensure better-sqlite3 is compiled for the current Node ABI.
 * Idempotent — safe to run from postinstall and dev.sh before API start.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const stampPath = join(serverDir, "node_modules", ".built-for-node-abi");
const abi = process.versions.modules;

function tryLoadSqlite() {
  try {
    require("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

function readStamp() {
  try {
    return readFileSync(stampPath, "utf8").trim();
  } catch {
    return "";
  }
}

function rebuild() {
  execSync("npm rebuild better-sqlite3", {
    cwd: serverDir,
    stdio: "inherit",
  });
}

const stamp = readStamp();
const loadOk = tryLoadSqlite();

if (stamp === abi && loadOk) {
  process.exit(0);
}

const reason =
  stamp && stamp !== abi
    ? `Node ABI changed (${stamp} → ${abi})`
    : loadOk
      ? "stamp missing"
      : "native module load failed";

console.log(
  `[ensure-native] Node ${process.version} (ABI ${abi}) — ${reason}, rebuilding better-sqlite3…`,
);

try {
  rebuild();
} catch (err) {
  console.error(
    "[ensure-native] npm rebuild failed. Install build tools (python3, make, g++) and retry:",
  );
  console.error(`  cd ${serverDir} && npm rebuild better-sqlite3`);
  process.exit(1);
}

if (!tryLoadSqlite()) {
  console.error(
    "[ensure-native] better-sqlite3 still cannot load after rebuild.",
  );
  process.exit(1);
}

writeFileSync(stampPath, abi);
console.log(`[ensure-native] better-sqlite3 ready for Node ABI ${abi}`);
