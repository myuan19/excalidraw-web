import { randomUUID } from "crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import path from "path";

import {
  ensureCatalogThumbnails,
  validateCatalogDocument,
} from "./catalogDocument.js";
import {
  pickFresherCatalogFile,
  resolveMappingRootPath,
} from "./mappingRootUtils.js";
import {
  SIDECAR_DIR,
  currentFileVersion,
  hashString,
  inferKindFromPath,
  isDocumentFile,
  nextFileVersion,
  stripKnownExtension,
} from "./sidecar.js";

const DEFAULT_YIELD_EVERY = 48;
const DEFAULT_CHECKPOINT_EVERY = 400;

function sortDirents(a, b) {
  if (a.isDirectory() !== b.isDirectory()) {
    return a.isDirectory() ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function yieldToEventLoop() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function stripParsed(meta) {
  for (const file of meta.files ?? []) {
    delete file._parsed;
  }
}

/**
 * 异步扫描目录：分批让出事件循环，避免大目录阻塞 Electron/Express。
 * @param {import('./sidecar.js').FolderMappingSidecar} sidecar
 * @param {object} meta
 * @param {{
 *   contentMode?: 'stat-only' | 'pending-only' | 'full',
 *   yieldEvery?: number,
 *   checkpointEvery?: number,
 *   onProgress?: (info: { processed: number, folders: number, files: number }) => void,
 *   onCheckpoint?: (meta: object) => void,
 *   shouldCancel?: () => boolean,
 * }} [options]
 */
export async function scanCatalogAsync(sidecar, meta, options = {}) {
  const contentMode = options.contentMode ?? "full";
  const yieldEvery = options.yieldEvery ?? DEFAULT_YIELD_EVERY;
  const checkpointEvery = options.checkpointEvery ?? DEFAULT_CHECKPOINT_EVERY;
  const onProgress = options.onProgress;
  const onCheckpoint = options.onCheckpoint;
  const shouldCancel = options.shouldCancel ?? (() => false);

  const foldersByPath = new Map(
    meta.folders.map((folder) => [folder.path, folder]),
  );
  // 历史 meta 可能残留同 path 重复条目（API 更新第一条、Map 覆盖取最后
  // 一条会拿到过期 sha，触发缩略图误删）；建快照时按新旧收敛而非盲覆盖。
  const filesByPath = new Map();
  for (const file of meta.files) {
    filesByPath.set(
      file.path,
      pickFresherCatalogFile(filesByPath.get(file.path), file),
    );
  }
  const uniqueRoots = [];
  const seenRootPaths = new Set();
  for (const root of meta.mapping_roots ?? []) {
    const key = resolveMappingRootPath(root.absPath);
    if (!key || seenRootPaths.has(key)) {
      continue;
    }
    seenRootPaths.add(key);
    uniqueRoots.push({ ...root, absPath: key });
  }
  const mappingRoots = uniqueRoots;
  const next = {
    version: meta.version,
    mapping_roots: mappingRoots,
    folders: [],
    files: [],
  };

  const anchorFolders = meta.folders.filter(
    (folder) =>
      folder.is_mapping_root ||
      mappingRoots.some((root) => root.mountFolderId === folder.id),
  );

  const mappingAbsPaths = mappingRoots
    .map((root) => resolveMappingRootPath(root.absPath))
    .filter(Boolean);
  const isUnderMappingRoot = (absPath) => {
    const resolved = path.resolve(absPath);
    return mappingAbsPaths.some(
      (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
    );
  };

  // 扫描持有的是 pass 开始时的 meta 快照；应用内保存会在扫描期间同时更新
  // 磁盘文件与实时 meta。若只用快照 sha 判定「内容变更」，扫描进行中刚保存
  // 的文件会被误判为外部修改，刚上传的缩略图被 rmSync 删除（下次打开首页
  // GET /thumbnail 404 → 卡片空白）。因此任何破坏性动作（删缩略图、版本
  // 抬升）前都用实时 meta 复核；实时 meta 带短 TTL 缓存，避免大目录首扫
  // 时逐文件重复解析 workspace.json。
  const LIVE_META_MAX_AGE_MS = 2000;
  let liveFilesById = null;
  let liveMetaLoadedAt = 0;
  const loadLiveFileById = (fileId) => {
    const now = Date.now();
    if (!liveFilesById || now - liveMetaLoadedAt > LIVE_META_MAX_AGE_MS) {
      liveMetaLoadedAt = now;
      try {
        liveFilesById = new Map();
        for (const file of sidecar.load().files ?? []) {
          liveFilesById.set(
            file.id,
            pickFresherCatalogFile(liveFilesById.get(file.id), file),
          );
        }
      } catch {
        liveFilesById = new Map();
      }
    }
    return liveFilesById.get(fileId) ?? null;
  };

  let processed = 0;
  const maybeYield = async () => {
    processed += 1;
    if (processed % yieldEvery !== 0) {
      return;
    }
    onProgress?.({
      processed,
      folders: next.folders.length,
      files: next.files.length,
    });
    if (shouldCancel()) {
      const error = new Error("scan cancelled");
      error.code = "scan_cancelled";
      throw error;
    }
    await yieldToEventLoop();
    if (processed % checkpointEvery === 0 && onCheckpoint) {
      onCheckpoint(JSON.parse(JSON.stringify(next)));
    }
  };

  const upsertFolder = async (folder) => {
    const prev = foldersByPath.get(folder.path);
    if (prev) {
      const merged = {
        ...prev,
        ...folder,
        id: prev.id,
        is_mapping_root: prev.is_mapping_root || folder.is_mapping_root,
        mapping_root_id: prev.mapping_root_id ?? folder.mapping_root_id,
      };
      foldersByPath.set(folder.path, merged);
      const index = next.folders.findIndex((item) => item.id === prev.id);
      if (index >= 0) {
        next.folders[index] = merged;
      } else {
        next.folders.push(merged);
      }
      await maybeYield();
      return merged.id;
    }
    foldersByPath.set(folder.path, folder);
    next.folders.push(folder);
    await maybeYield();
    return folder.id;
  };

  const upsertFile = async (file) => {
    const prev = filesByPath.get(file.path);
    if (prev) {
      const merged = { ...prev, ...file, id: prev.id };
      filesByPath.set(file.path, merged);
      const index = next.files.findIndex((item) => item.id === prev.id);
      if (index >= 0) {
        next.files[index] = merged;
      } else {
        next.files.push(merged);
      }
      await maybeYield();
      return merged;
    }
    filesByPath.set(file.path, file);
    next.files.push(file);
    await maybeYield();
    return file;
  };

  for (const folder of anchorFolders) {
    await upsertFolder({ ...folder });
  }

  const ingestFile = async (absPath, storePath, parentId, sortIndex, scope) => {
    const pathKind = inferKindFromPath(storePath);
    const stats = statSync(absPath);
    const existing = filesByPath.get(storePath);
    const mtimeIso = stats.mtime.toISOString();

    if (
      contentMode === "stat-only" &&
      existing &&
      existing.updated_at === mtimeIso &&
      existing.content_sha256 &&
      existing.health !== "pending"
    ) {
      await upsertFile({
        ...existing,
        folder_id: parentId,
        sort_index: sortIndex,
      });
      return;
    }

    if (contentMode === "stat-only" && !existing) {
      await upsertFile({
        id: randomUUID(),
        name: stripKnownExtension(path.basename(absPath)),
        kind: pathKind,
        folder_id: parentId,
        sort_index: sortIndex,
        created_at: stats.birthtime.toISOString(),
        updated_at: mtimeIso,
        content_sha256: null,
        version: 0,
        path: storePath,
        origin:
          scope === "workspace"
            ? "managed"
            : existing?.origin === "external"
            ? "external"
            : "managed",
        archives: [],
        health: "pending",
        parse_error: null,
        scan_pending: true,
      });
      return;
    }

    if (
      contentMode === "stat-only" &&
      existing &&
      existing.updated_at === mtimeIso &&
      !existing.scan_pending
    ) {
      await upsertFile({
        ...existing,
        folder_id: parentId,
        sort_index: sortIndex,
      });
      return;
    }

    if (
      contentMode === "pending-only" &&
      existing &&
      !existing.scan_pending &&
      existing.health !== "pending"
    ) {
      await upsertFile({
        ...existing,
        folder_id: parentId,
        sort_index: sortIndex,
      });
      return;
    }

    let raw = "";
    try {
      raw = readFileSync(absPath, "utf-8");
    } catch (error) {
      await upsertFile({
        id: existing?.id ?? randomUUID(),
        name: existing?.name ?? stripKnownExtension(path.basename(absPath)),
        kind: pathKind,
        folder_id: parentId,
        sort_index: sortIndex,
        created_at: existing?.created_at ?? stats.birthtime.toISOString(),
        updated_at: mtimeIso,
        content_sha256: null,
        version: currentFileVersion(existing?.version),
        path: storePath,
        origin: existing?.origin === "external" ? "external" : "managed",
        archives: existing?.archives ?? [],
        health: "corrupt",
        parse_error: error instanceof Error ? error.message : "read_failed",
      });
      return;
    }

    const validation = validateCatalogDocument(raw, pathKind);
    const kind = validation.ok ? validation.kind : pathKind;
    const origin =
      scope === "workspace"
        ? "managed"
        : existing?.origin === "external"
        ? "external"
        : "managed";
    const nextSha = validation.ok
      ? hashString(raw)
      : existing?.content_sha256 ?? null;
    let versionBase = existing?.version;
    let contentChanged =
      validation.ok &&
      existing &&
      existing.content_sha256 !== nextSha;
    if (contentChanged) {
      const live = loadLiveFileById(existing.id);
      if (live) {
        versionBase = live.version;
        if (live.content_sha256 === nextSha) {
          // 快照已过期：磁盘上的新内容来自扫描期间的应用内保存（实时 meta
          // 已记录同一 sha），不是外部变更，不得删缩略图/抬版本。
          contentChanged = false;
        }
      }
    }
    if (contentChanged) {
      rmSync(sidecar.thumbnailPath(existing.id), { force: true });
    }
    const saved = await upsertFile({
      id: existing?.id ?? randomUUID(),
      name: existing?.name ?? stripKnownExtension(path.basename(absPath)),
      kind: existing?.kind ?? kind,
      folder_id: parentId,
      sort_index: sortIndex,
      created_at: existing?.created_at ?? stats.birthtime.toISOString(),
      updated_at: mtimeIso,
      content_sha256: nextSha,
      version: contentChanged
        ? nextFileVersion(versionBase)
        : currentFileVersion(versionBase ?? existing?.version),
      path: storePath,
      origin,
      archives: existing?.archives ?? [],
      health: validation.ok ? "ok" : "corrupt",
      parse_error: validation.ok
        ? null
        : validation.message ?? validation.error,
      ...(validation.ok ? { _parsed: validation.data } : {}),
    });
    delete saved.scan_pending;
  };

  const walkDirectory = async (absDir, parentId, scope) => {
    if (!existsSync(absDir)) {
      return;
    }
    const entries = readdirSync(absDir, { withFileTypes: true }).sort(sortDirents);
    for (const [sortIndex, entry] of entries.entries()) {
      if (entry.name === SIDECAR_DIR) {
        continue;
      }
      const absPath = path.join(absDir, entry.name);
      if (scope === "workspace" && isUnderMappingRoot(absPath)) {
        continue;
      }
      const storePath = sidecar.storePathKey(absPath);
      if (entry.isDirectory()) {
        const stats = statSync(absPath);
        const existing = foldersByPath.get(storePath);
        const folderId = await upsertFolder({
          id: existing?.id ?? randomUUID(),
          parent_id: parentId,
          name: entry.name,
          sort_index: existing?.sort_index ?? sortIndex,
          created_at: existing?.created_at ?? stats.birthtime.toISOString(),
          updated_at: stats.mtime.toISOString(),
          path: storePath,
          is_mapping_root: existing?.is_mapping_root ?? false,
          mapping_root_id: existing?.mapping_root_id ?? null,
        });
        await walkDirectory(absPath, folderId, scope);
        continue;
      }
      if (!entry.isFile() || !isDocumentFile(entry.name)) {
        continue;
      }
      await ingestFile(absPath, storePath, parentId, sortIndex, scope);
    }
  };

  for (const root of mappingRoots) {
    if (!root?.absPath || !existsSync(root.absPath)) {
      continue;
    }
    await walkDirectory(resolveMappingRootPath(root.absPath), root.mountFolderId, "mapping");
  }

  for (const existing of meta.files.filter((file) => file.origin === "external")) {
    const absPath = sidecar.resolve(existing.path);
    if (
      !existsSync(absPath) ||
      !statSync(absPath).isFile() ||
      !isDocumentFile(path.basename(absPath)) ||
      isUnderMappingRoot(absPath)
    ) {
      continue;
    }
    const rootWithSep = sidecar.workspaceRoot.endsWith(path.sep)
      ? sidecar.workspaceRoot
      : `${sidecar.workspaceRoot}${path.sep}`;
    if (absPath === sidecar.workspaceRoot || absPath.startsWith(rootWithSep)) {
      continue;
    }
    await ingestFile(
      absPath,
      existing.path,
      null,
      existing.sort_index ?? 0,
      "external",
    );
  }

  if (contentMode === "full" || contentMode === "pending-only") {
    ensureCatalogThumbnails(next, sidecar);
  }
  stripParsed(next);
  return next;
}
