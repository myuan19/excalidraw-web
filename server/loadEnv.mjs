import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Load EXCALIDRAW_DATA_DIR from repo .env files (server-only; not VITE_*). */
for (const name of [".env.development.local", ".env.development"]) {
  const path = join(repoRoot, name);
  if (!existsSync(path)) {
    continue;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (key !== "EXCALIDRAW_DATA_DIR" || process.env.EXCALIDRAW_DATA_DIR) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      process.env.EXCALIDRAW_DATA_DIR = value;
    }
  }
}
