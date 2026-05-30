import { readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

/** @param {string} spec e.g. 10M, 200M */
export function parseByteSize(spec) {
  const s = String(spec ?? "").trim();
  const m = /^(\d+(?:\.\d+)?)\s*([BKMG])?$/i.exec(s);
  if (!m) {
    return 0;
  }
  const n = Number.parseFloat(m[1]);
  const unit = (m[2] || "B").toUpperCase();
  const mult = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  return Math.floor(n * (mult[unit] ?? 1));
}

/**
 * @param {string} logDir
 * @param {string} prefix
 * @param {Set<string>} protect
 */
function listManagedLogFiles(logDir, prefix, protect) {
  const sessionPattern = new RegExp(
    `^${prefix}-\\d{8}-\\d{6}-\\d+\\.log(\\.\\d+)?(\\.gz)?$`,
  );
  const legacyPattern = new RegExp(`^${prefix}\\.log(\\.\\d+)?(\\.gz)?$`);

  return readdirSync(logDir)
    .filter(
      (name) =>
        (sessionPattern.test(name) || legacyPattern.test(name)) &&
        !protect.has(name),
    )
    .map((name) => {
      const path = join(logDir, name);
      const st = statSync(path);
      return { name, path, mtime: st.mtimeMs, size: st.size };
    })
    .sort((a, b) => a.mtime - b.mtime);
}

/**
 * Delete oldest matching log files until total size is under maxTotalBytes.
 * Never deletes basenames listed in protectBasenames (current session files).
 *
 * @param {string} logDir
 * @param {{ prefix: string, protectBasenames?: string[], maxTotalBytes: number, maxFileCount?: number | null }} opts
 * @returns {{ removed: string[], totalBytes: number }}
 */
export function pruneLogFiles(logDir, opts) {
  const protect = new Set(opts.protectBasenames ?? []);

  /** @type {{ name: string, path: string, mtime: number, size: number }[]} */
  let files;
  try {
    files = listManagedLogFiles(logDir, opts.prefix, protect);
  } catch {
    return { removed: [], totalBytes: 0 };
  }

  let totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  for (const name of protect) {
    try {
      totalBytes += statSync(join(logDir, name)).size;
    } catch {
      // current session file may not exist yet
    }
  }

  const removed = [];
  const maxFiles = opts.maxFileCount ?? null;

  while (files.length > 0) {
    const overSize = opts.maxTotalBytes > 0 && totalBytes > opts.maxTotalBytes;
    const overCount = maxFiles != null && files.length + protect.size > maxFiles;
    if (!overSize && !overCount) {
      break;
    }
    const oldest = files.shift();
    if (!oldest) {
      break;
    }
    try {
      unlinkSync(oldest.path);
      removed.push(oldest.name);
      totalBytes -= oldest.size;
    } catch {
      // ignore races
    }
  }

  return { removed, totalBytes };
}
