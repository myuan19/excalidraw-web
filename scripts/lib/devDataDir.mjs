import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveDevDataDir() {
  const fromEnv = process.env.EXCALIDRAW_DATA_DIR?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fromEnv)
      ? fromEnv
      : join(REPO_ROOT, fromEnv);
  }
  return join(REPO_ROOT, "_dev_data");
}

export function resolveDevFilesRoot() {
  return join(resolveDevDataDir(), "files");
}
