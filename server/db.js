import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Persisted volume in Docker: `-v …:/var/lib/excalidraw` + `EXCALIDRAW_DATA_DIR=/var/lib/excalidraw` */
const DATA_DIR = process.env.EXCALIDRAW_DATA_DIR
  ? process.env.EXCALIDRAW_DATA_DIR
  : join(__dirname, "data");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "excalidraw.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Logical layout (see routes under server/routes/):
 * - files, file_folders, archives: canvas documents; large JSON on disk under files/<id>/, metadata + hashes in DB
 * - library_items: public | personal | canvas-scoped shapes (JSON in `data` column)
 * - library_groups: published-library grouping + per-row collapsed flag (item_ids JSON array)
 * - ai_settings: single row id=1, OpenAI-compatible JSON (no auth — LAN-only deployment)
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    folder_id  TEXT,
    sort_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (folder_id) REFERENCES file_folders(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS file_folders (
    id         TEXT PRIMARY KEY,
    parent_id  TEXT,
    name       TEXT NOT NULL,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES file_folders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS archives (
    id         TEXT PRIMARY KEY,
    file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    label      TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    path       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS library_items (
    id         TEXT PRIMARY KEY,
    scope      TEXT NOT NULL DEFAULT 'public',
    file_id    TEXT,
    name       TEXT DEFAULT '',
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sort_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS library_groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    item_ids   TEXT NOT NULL DEFAULT '[]',
    sort_index INTEGER NOT NULL DEFAULT 0,
    collapsed  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ai_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    config_json TEXT NOT NULL DEFAULT '{}'
  );
`);

try {
  db.exec(`ALTER TABLE archives ADD COLUMN content_sha256 TEXT`);
} catch {
  // column exists
}

try {
  db.exec(`ALTER TABLE files ADD COLUMN content_sha256 TEXT`);
} catch {
  // column exists
}

try {
  db.exec(`ALTER TABLE files ADD COLUMN folder_id TEXT`);
} catch {
  // column exists
}

try {
  db.exec(`ALTER TABLE files ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0`);
} catch {
  // column exists
}

try {
  db.exec(`ALTER TABLE library_items ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0`);
} catch {
  // column exists
}

export default db;
export { DATA_DIR };
