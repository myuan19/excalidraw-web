import { createHash, randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";

export const SIDECAR_DIR = ".editorhub";
export const SIDECAR_FILE = "workspace.json";
export const THUMBNAIL_DIR = "thumbnails";
export const ARCHIVE_DIR = "archives";
export const SIDECAR_VERSION = 1;

export const DOCUMENT_EXTENSIONS = [
  ".excalidraw",
  ".excalidraw.json",
  ".smm",
  ".mindmap.json",
  ".json",
  ".txt",
];

export function nowIso() {
  return new Date().toISOString();
}

export function hashJson(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export function hashString(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeRelPath(value) {
  return value.split(path.sep).join("/");
}

export function safeName(value, fallback = "Untitled") {
  const name = String(value || "")
    // 文件名不能包含 Windows 保留字符和控制字符。
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (name || fallback).slice(0, 120);
}

export function extensionForKind(kind) {
  if (kind === "mindmap") {
    return ".smm";
  }
  if (kind === "text") {
    return ".txt";
  }
  return ".excalidraw";
}

export function inferKindFromPath(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".smm") || lower.endsWith(".mindmap.json")) {
    return "mindmap";
  }
  if (lower.endsWith(".txt")) {
    return "text";
  }
  return "excalidraw";
}

export function stripKnownExtension(fileName) {
  const lower = fileName.toLowerCase();
  const extension = DOCUMENT_EXTENSIONS.find((item) => lower.endsWith(item));
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function isDocumentFile(fileName) {
  const lower = fileName.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function createDefaultMeta() {
  return {
    version: SIDECAR_VERSION,
    folders: [],
    files: [],
  };
}

function normalizeMeta(value) {
  if (!value || typeof value !== "object") {
    return createDefaultMeta();
  }
  return {
    version: SIDECAR_VERSION,
    folders: Array.isArray(value.folders) ? value.folders : [],
    files: Array.isArray(value.files) ? value.files : [],
  };
}

function sortDirents(a, b) {
  if (a.isDirectory() !== b.isDirectory()) {
    return a.isDirectory() ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export class FolderMappingSidecar {
  constructor(workspacePath) {
    this.workspaceRoot = path.resolve(workspacePath);
    this.sidecarRoot = path.join(this.workspaceRoot, SIDECAR_DIR);
    this.metaPath = path.join(this.sidecarRoot, SIDECAR_FILE);
    this.thumbnailRoot = path.join(this.sidecarRoot, THUMBNAIL_DIR);
    this.archiveRoot = path.join(this.sidecarRoot, ARCHIVE_DIR);
  }

  ensure() {
    mkdirSync(this.workspaceRoot, { recursive: true });
    mkdirSync(this.sidecarRoot, { recursive: true });
    mkdirSync(this.thumbnailRoot, { recursive: true });
    mkdirSync(this.archiveRoot, { recursive: true });
  }

  load() {
    this.ensure();
    if (!existsSync(this.metaPath)) {
      return createDefaultMeta();
    }
    try {
      return normalizeMeta(JSON.parse(readFileSync(this.metaPath, "utf-8")));
    } catch {
      return createDefaultMeta();
    }
  }

  save(meta) {
    this.ensure();
    writeFileSync(
      this.metaPath,
      `${JSON.stringify(normalizeMeta(meta), null, 2)}\n`,
    );
  }

  loadAndScan() {
    const meta = this.load();
    const scanned = this.scan(meta);
    this.save(scanned);
    return scanned;
  }

  resolve(relPath) {
    const absPath = path.resolve(this.workspaceRoot, relPath || ".");
    const rootWithSep = this.workspaceRoot.endsWith(path.sep)
      ? this.workspaceRoot
      : `${this.workspaceRoot}${path.sep}`;
    if (absPath !== this.workspaceRoot && !absPath.startsWith(rootWithSep)) {
      throw new Error(`Path escapes workspace: ${relPath}`);
    }
    return absPath;
  }

  relative(absPath) {
    return normalizeRelPath(path.relative(this.workspaceRoot, absPath));
  }

  thumbnailPath(fileId) {
    return path.join(this.thumbnailRoot, `${fileId}.svg`);
  }

  archivePath(fileId, archiveId) {
    const dir = path.join(this.archiveRoot, fileId);
    mkdirSync(dir, { recursive: true });
    return path.join(dir, `${archiveId}.json`);
  }

  removeFileArtifacts(fileId) {
    rmSync(this.thumbnailPath(fileId), { force: true });
    rmSync(path.join(this.archiveRoot, fileId), {
      recursive: true,
      force: true,
    });
  }

  scan(meta) {
    const foldersByPath = new Map(
      meta.folders.map((folder) => [folder.path, folder]),
    );
    const filesByPath = new Map(meta.files.map((file) => [file.path, file]));
    const next = createDefaultMeta();

    const walk = (absDir, parentId) => {
      const entries = readdirSync(absDir, { withFileTypes: true }).sort(
        sortDirents,
      );
      entries.forEach((entry, sortIndex) => {
        if (entry.name === SIDECAR_DIR) {
          return;
        }
        const absPath = path.join(absDir, entry.name);
        const relPath = this.relative(absPath);
        if (entry.isDirectory()) {
          const stats = statSync(absPath);
          const existing = foldersByPath.get(relPath);
          const folder = {
            id: existing?.id ?? randomUUID(),
            parent_id: parentId,
            name: entry.name,
            sort_index: existing?.sort_index ?? sortIndex,
            created_at: existing?.created_at ?? stats.birthtime.toISOString(),
            updated_at: stats.mtime.toISOString(),
            path: relPath,
          };
          next.folders.push(folder);
          walk(absPath, folder.id);
          return;
        }
        if (!entry.isFile() || !isDocumentFile(entry.name)) {
          return;
        }
        const stats = statSync(absPath);
        const raw = readFileSync(absPath, "utf-8");
        const existing = filesByPath.get(relPath);
        next.files.push({
          id: existing?.id ?? randomUUID(),
          name: existing?.name ?? stripKnownExtension(entry.name),
          kind: existing?.kind ?? inferKindFromPath(relPath),
          folder_id: parentId,
          sort_index: existing?.sort_index ?? sortIndex,
          created_at: existing?.created_at ?? stats.birthtime.toISOString(),
          updated_at: stats.mtime.toISOString(),
          content_sha256: hashString(raw),
          path: relPath,
          archives: existing?.archives ?? [],
        });
      });
    };

    walk(this.workspaceRoot, null);
    return next;
  }
}
