import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Local dev persistence — project `_dev_data/`, separate from source (gitignored, not in Docker image). */
export const DEFAULT_DATA_DIR = join(REPO_ROOT, "_dev_data");

export function resolveDataDir() {
  const fromEnv = process.env.EXCALIDRAW_DATA_DIR?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fromEnv)
      ? fromEnv
      : join(REPO_ROOT, fromEnv);
  }
  return DEFAULT_DATA_DIR;
}

export { REPO_ROOT };
