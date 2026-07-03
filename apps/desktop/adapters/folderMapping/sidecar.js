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

import {
  ensureCatalogThumbnails,
  validateCatalogDocument,
} from "./catalogDocument.js";
import { pickFresherCatalogFile } from "./mappingRootUtils.js";

export const SIDECAR_DIR = ".editorhub";
export const SIDECAR_FILE = "workspace.json";
export const THUMBNAIL_DIR = "thumbnails";
export const ARCHIVE_DIR = "archives";
export const SIDECAR_VERSION = 1;
export const FILE_VERSION_MAX = 2_147_483_647;

export const DOCUMENT_EXTENSIONS = [
  ".excalidraw",
  ".excalidraw.json",
  ".smm",
  ".mindmap.json",
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

export function currentFileVersion(version) {
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

export function nextFileVersion(version) {
  const current = currentFileVersion(version);
  return current >= FILE_VERSION_MAX ? 0 : current + 1;
}

export function normalizeRelPath(value) {
  return value.split(path.sep).join("/");
}

export function safeName(value, fallback = "Untitled") {
  const name = String(value || "")
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
  return ".excalidraw";
}

export function inferKindFromPath(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".smm") || lower.endsWith(".mindmap.json")) {
    return "mindmap";
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
    mapping_roots: [],
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
    mapping_roots: Array.isArray(value.mapping_roots)
      ? value.mapping_roots
      : [],
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
    ensureCatalogThumbnails(scanned, this);
    for (const file of scanned.files ?? []) {
      delete file._parsed;
    }
    this.save(scanned);
    return scanned;
  }

  /** 持久化路径键：workspace 内为相对路径，映射根外为规范化绝对路径。 */
  storePathKey(absPath) {
    const resolved = path.resolve(absPath);
    const rootWithSep = this.workspaceRoot.endsWith(path.sep)
      ? this.workspaceRoot
      : `${this.workspaceRoot}${path.sep}`;
    if (resolved === this.workspaceRoot || resolved.startsWith(rootWithSep)) {
      return normalizeRelPath(path.relative(this.workspaceRoot, resolved));
    }
    return normalizeRelPath(resolved);
  }

  resolve(storePath) {
    if (!storePath) {
      return this.workspaceRoot;
    }
    if (path.isAbsolute(storePath)) {
      return path.resolve(storePath);
    }
    const absPath = path.resolve(this.workspaceRoot, storePath);
    const rootWithSep = this.workspaceRoot.endsWith(path.sep)
      ? this.workspaceRoot
      : `${this.workspaceRoot}${path.sep}`;
    if (absPath !== this.workspaceRoot && !absPath.startsWith(rootWithSep)) {
      throw new Error(`Path escapes workspace: ${storePath}`);
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
    // 同 path 重复条目按新旧收敛，避免快照拿到过期 sha 误删缩略图
    const filesByPath = new Map();
    for (const file of meta.files) {
      filesByPath.set(
        file.path,
        pickFresherCatalogFile(filesByPath.get(file.path), file),
      );
    }
    const mappingRoots = [...(meta.mapping_roots ?? [])];
    const next = {
      version: SIDECAR_VERSION,
      mapping_roots: mappingRoots,
      folders: [],
      files: [],
    };

    const anchorFolders = meta.folders.filter(
      (folder) =>
        folder.is_mapping_root ||
        mappingRoots.some((root) => root.mountFolderId === folder.id),
    );
    for (const folder of anchorFolders) {
      next.folders.push({ ...folder });
    }

    const mappingAbsPaths = mappingRoots
      .map((root) => (root?.absPath ? path.resolve(root.absPath) : ""))
      .filter(Boolean);
    const isUnderMappingRoot = (absPath) => {
      const resolved = path.resolve(absPath);
      return mappingAbsPaths.some(
        (root) =>
          resolved === root || resolved.startsWith(`${root}${path.sep}`),
      );
    };

    const walkDirectory = (absDir, parentId, options = {}) => {
      const { scope = "workspace" } = options;
      if (!existsSync(absDir)) {
        return;
      }
      const entries = readdirSync(absDir, { withFileTypes: true }).sort(
        sortDirents,
      );
      entries.forEach((entry, sortIndex) => {
        if (entry.name === SIDECAR_DIR) {
          return;
        }
        const absPath = path.join(absDir, entry.name);
        if (scope === "workspace" && isUnderMappingRoot(absPath)) {
          return;
        }
        const storePath = this.storePathKey(absPath);
        if (entry.isDirectory()) {
          const stats = statSync(absPath);
          const existing = foldersByPath.get(storePath);
          const folder = {
            id: existing?.id ?? randomUUID(),
            parent_id: parentId,
            name: entry.name,
            sort_index: existing?.sort_index ?? sortIndex,
            created_at: existing?.created_at ?? stats.birthtime.toISOString(),
            updated_at: stats.mtime.toISOString(),
            path: storePath,
            is_mapping_root: existing?.is_mapping_root ?? false,
            mapping_root_id: existing?.mapping_root_id ?? null,
          };
          next.folders.push(folder);
          walkDirectory(absPath, folder.id, options);
          return;
        }
        if (!entry.isFile() || !isDocumentFile(entry.name)) {
          return;
        }
        const pathKind = inferKindFromPath(storePath);
        let raw = "";
        try {
          raw = readFileSync(absPath, "utf-8");
        } catch (error) {
          const existing = filesByPath.get(storePath);
          next.files.push({
            id: existing?.id ?? randomUUID(),
            name: existing?.name ?? stripKnownExtension(entry.name),
            kind: pathKind,
            folder_id: parentId,
            sort_index: existing?.sort_index ?? sortIndex,
            created_at:
              existing?.created_at ?? statSync(absPath).birthtime.toISOString(),
            updated_at: statSync(absPath).mtime.toISOString(),
            content_sha256: null,
            version: currentFileVersion(existing?.version),
            path: storePath,
            origin: existing?.origin ?? "managed",
            archives: existing?.archives ?? [],
            health: "corrupt",
            parse_error: error instanceof Error ? error.message : "read_failed",
          });
          return;
        }
        const validation = validateCatalogDocument(raw, pathKind);
        const kind = validation.ok ? validation.kind : pathKind;
        const stats = statSync(absPath);
        const existing = filesByPath.get(storePath);
        // 映射目录内文件与 workspace 一样可直接编辑
        const origin =
          scope === "workspace"
            ? "managed"
            : existing
            ? existing.origin === "external"
              ? "external"
              : "managed"
            : "managed";
        const nextSha = validation.ok
          ? hashString(raw)
          : existing?.content_sha256 ?? null;
        const contentChanged =
          validation.ok &&
          existing &&
          existing.content_sha256 !== nextSha;
        if (contentChanged) {
          rmSync(this.thumbnailPath(existing.id), { force: true });
        }
        next.files.push({
          id: existing?.id ?? randomUUID(),
          name: existing?.name ?? stripKnownExtension(entry.name),
          kind: existing?.kind ?? kind,
          folder_id: parentId,
          sort_index: existing?.sort_index ?? sortIndex,
          created_at: existing?.created_at ?? stats.birthtime.toISOString(),
          updated_at: stats.mtime.toISOString(),
          content_sha256: nextSha,
          version: contentChanged
            ? nextFileVersion(existing.version)
            : currentFileVersion(existing?.version),
          path: storePath,
          origin,
          archives: existing?.archives ?? [],
          health: validation.ok ? "ok" : "corrupt",
          parse_error: validation.ok
            ? null
            : validation.message ?? validation.error,
          ...(validation.ok ? { _parsed: validation.data } : {}),
        });
      });
    };

    for (const root of mappingRoots) {
      if (!root?.absPath || !existsSync(root.absPath)) {
        continue;
      }
      walkDirectory(path.resolve(root.absPath), root.mountFolderId, {
        scope: "mapping",
      });
    }

    for (const existing of meta.files.filter(
      (file) => file.origin === "external",
    )) {
      const absPath = this.resolve(existing.path);
      if (
        !existsSync(absPath) ||
        !statSync(absPath).isFile() ||
        !isDocumentFile(path.basename(absPath)) ||
        isUnderMappingRoot(absPath)
      ) {
        continue;
      }
      const rootWithSep = this.workspaceRoot.endsWith(path.sep)
        ? this.workspaceRoot
        : `${this.workspaceRoot}${path.sep}`;
      if (absPath === this.workspaceRoot || absPath.startsWith(rootWithSep)) {
        continue;
      }

      const pathKind = inferKindFromPath(existing.path);
      let raw = "";
      try {
        raw = readFileSync(absPath, "utf-8");
      } catch (error) {
        next.files.push({
          ...existing,
          updated_at: statSync(absPath).mtime.toISOString(),
          content_sha256: null,
          health: "corrupt",
          parse_error: error instanceof Error ? error.message : "read_failed",
        });
        continue;
      }
      const validation = validateCatalogDocument(raw, pathKind);
      const stats = statSync(absPath);
      const nextSha = validation.ok
        ? hashString(raw)
        : existing.content_sha256 ?? null;
      const contentChanged =
        validation.ok &&
        existing.content_sha256 !== nextSha;
      if (contentChanged) {
        rmSync(this.thumbnailPath(existing.id), { force: true });
      }
      next.files.push({
        ...existing,
        name: existing.name ?? stripKnownExtension(path.basename(absPath)),
        kind: validation.ok ? validation.kind : existing.kind ?? pathKind,
        folder_id: null,
        sort_index: existing.sort_index ?? 0,
        updated_at: stats.mtime.toISOString(),
        content_sha256: nextSha,
        version: contentChanged
          ? nextFileVersion(existing.version)
          : currentFileVersion(existing.version),
        origin: "external",
        health: validation.ok ? "ok" : "corrupt",
        parse_error: validation.ok
          ? null
          : validation.message ?? validation.error,
        ...(validation.ok ? { _parsed: validation.data } : {}),
      });
    }

    return next;
  }
}
