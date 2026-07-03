import { isDesktopEditorHub } from "../lib/runtimePlatform";

import type { FileTreeResponse, ServerFile } from "./ServerSync";

const CACHE_KEY = "excalidraw-filelist-tree-v1";
const CACHE_ETAG_KEY = "excalidraw-filelist-tree-etag-v1";
// 轻量版本哨兵：每次写缓存自增并写入一个很短的字符串。读取热路径只需比较这个短串，
// 即可判断 memParsed 是否仍然有效，而无需 getItem 拷贝并逐字符比较整棵大树字符串。
const CACHE_VERSION_KEY = "excalidraw-filelist-tree-ver-v1";

/**
 * 桌面端跨会话镜像（localStorage）：sessionStorage 每次启动为空，冷启动首屏
 * 必然退化为骨架 + 全量 GET /tree。镜像让 SWR 首屏在启动瞬间就有上次的树
 * （文件名/contentSha/has_thumbnail），刷新语义不变：GET /tree 返回后照常覆盖。
 * ETag 一并镜像，配合 Express 默认弱 ETag，内容未变时首个 /tree 直接 304。
 * Web 端不镜像——浏览器同 tab 刷新本就保留 sessionStorage，跨 tab 用旧树反而更陈旧。
 */
const PERSIST_KEY = "excalidraw-filelist-tree-persist-v1";
const PERSIST_ETAG_KEY = "excalidraw-filelist-tree-persist-etag-v1";

function isTreePersistMirrorEnabled(): boolean {
  return isDesktopEditorHub();
}

/**
 * 内存记忆层：sessionStorage 里整棵文件树（可达数千文件夹）的 JSON 体量很大（可达 1-2MB）。
 * 该缓存仅由本 tab 通过 writeFileListTreeCache 写入（CACHE_KEY 仅在本文件读写、sessionStorage
 * 又是单 tab 隔离），因此一旦解析过一次，memParsed 即为权威副本。
 *
 * 两类重复成本（renderer CPU profile 实测）：
 *  1) JSON.parse 整树：Excalidraw 拖拽时一度占 ~22% 主线程 CPU。
 *  2) getItem + 整串比较：findFileInTreeCache 在列表排序/合并里被每项 ×每帧调用，
 *     冷启动时反复 getItem 拷贝并比较 1-2MB 字符串，占 ~20% 主线程 CPU。
 * 通过版本哨兵（短串）判定有效性后直接复用 memParsed，两类成本在树不变期间均归零。
 */
let memParsed: FileTreeResponse | null = null;
let memVersion: string | null = null;
let writeCounter = 0;

/**
 * id → file 索引：列表渲染/排序热路径上需要按 id 取文件元数据（如
 * readFileListIncrementalPatch / resolveListSortUpdatedAt）。在数千文件下，
 * 逐次 `files.find()` 是 O(n)，被每个列表行 ×每帧调用即退化为 O(n²)，
 * 在 Excalidraw 拖拽重渲染时可占据 ~19% 主线程 CPU（renderer CPU profile 实测）。
 * 索引只在解析结果对象（memParsed）变化时重建一次，拖拽期间整树不变即全程复用。
 */
let memIndex: Map<string, ServerFile> | null = null;
let memIndexFor: FileTreeResponse | null = null;

function getTreeFileIndex(tree: FileTreeResponse): Map<string, ServerFile> {
  if (memIndex && memIndexFor === tree) {
    return memIndex;
  }
  const index = new Map<string, ServerFile>();
  for (const file of tree.files) {
    index.set(file.id, file);
  }
  memIndex = index;
  memIndexFor = tree;
  return index;
}

/** O(1) 按 id 取列表缓存中的文件（基于 memParsed 索引，热路径专用）。 */
export function findFileInTreeCache(fileId: string): ServerFile | null {
  const tree = readFileListTreeCache();
  if (!tree) {
    return null;
  }
  return getTreeFileIndex(tree).get(fileId) ?? null;
}

/** 去掉可能很大的字段，避免撑满 sessionStorage */
function stripFilesForCache(files: ServerFile[]): ServerFile[] {
  return files.map((f) => {
    const { data: _d, ...rest } = f;
    return rest;
  });
}

function parseTreeCacheRaw(raw: string): FileTreeResponse | null {
  try {
    const parsed = JSON.parse(raw) as FileTreeResponse;
    if (
      !parsed ||
      !Array.isArray(parsed.folders) ||
      !Array.isArray(parsed.files)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 冷启动从持久镜像回填 session 层；返回解析结果（同时同步 memParsed）。 */
function seedSessionFromPersistMirror(): FileTreeResponse | null {
  if (!isTreePersistMirrorEnabled()) {
    return null;
  }
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) {
      return null;
    }
    const parsed = parseTreeCacheRaw(raw);
    if (!parsed) {
      localStorage.removeItem(PERSIST_KEY);
      localStorage.removeItem(PERSIST_ETAG_KEY);
      return null;
    }
    sessionStorage.setItem(CACHE_KEY, raw);
    const nextVersion = String(++writeCounter);
    sessionStorage.setItem(CACHE_VERSION_KEY, nextVersion);
    const persistedEtag = localStorage.getItem(PERSIST_ETAG_KEY);
    if (persistedEtag?.trim()) {
      sessionStorage.setItem(CACHE_ETAG_KEY, persistedEtag.trim());
    }
    memParsed = parsed;
    memVersion = nextVersion;
    return parsed;
  } catch {
    return null;
  }
}

export function readFileListTreeCache(): FileTreeResponse | null {
  try {
    const version = sessionStorage.getItem(CACHE_VERSION_KEY);
    // 命中：仅比较了一个很短的版本串，未触碰可达 1-2MB 的整树字符串。
    // 仅在 version 非空时短路，确保 sessionStorage 被外部清空（version 变 null）时回退整读。
    if (version !== null && version === memVersion && memParsed) {
      return memParsed;
    }
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      const seeded = seedSessionFromPersistMirror();
      if (seeded) {
        return seeded;
      }
      memParsed = null;
      memVersion = null;
      return null;
    }
    const parsed = parseTreeCacheRaw(raw);
    if (!parsed) {
      memParsed = null;
      memVersion = null;
      return null;
    }
    memParsed = parsed;
    memVersion = version;
    return parsed;
  } catch {
    return null;
  }
}

export function writeFileListTreeCache(tree: FileTreeResponse): void {
  try {
    const payload: FileTreeResponse = {
      folders: tree.folders,
      files: stripFilesForCache(tree.files),
      capabilities: tree.capabilities,
      scan: tree.scan,
    };
    const raw = JSON.stringify(payload);
    sessionStorage.setItem(CACHE_KEY, raw);
    // 写入后同步记忆层与版本哨兵，使后续读取无需再解析或拷贝整树字符串。
    const nextVersion = String(++writeCounter);
    sessionStorage.setItem(CACHE_VERSION_KEY, nextVersion);
    memParsed = payload;
    memVersion = nextVersion;
    if (isTreePersistMirrorEnabled()) {
      try {
        localStorage.setItem(PERSIST_KEY, raw);
      } catch {
        // localStorage 配额独立于 sessionStorage：镜像失败不影响会话缓存
      }
    }
  } catch {
    // 配额或隐私模式：忽略
  }
}

export function readFileListTreeCacheEtag(): string | null {
  try {
    const raw = sessionStorage.getItem(CACHE_ETAG_KEY);
    if (raw?.trim()) {
      return raw.trim();
    }
    if (!isTreePersistMirrorEnabled()) {
      return null;
    }
    // 冷启动回填：etag 只有在缓存树同样可用时才能带（304 时须能直接返回缓存树），
    // 读一次树即触发镜像回填（含 etag），再从 session 取。
    if (!readFileListTreeCache()) {
      return null;
    }
    const seeded = sessionStorage.getItem(CACHE_ETAG_KEY);
    return seeded?.trim() ? seeded.trim() : null;
  } catch {
    return null;
  }
}

export function writeFileListTreeCacheEtag(etag: string | null): void {
  try {
    if (!etag?.trim()) {
      sessionStorage.removeItem(CACHE_ETAG_KEY);
      writeEtagPersistMirror(null);
      return;
    }
    sessionStorage.setItem(CACHE_ETAG_KEY, etag.trim());
    writeEtagPersistMirror(etag.trim());
  } catch {
    /* ignore */
  }
}

function writeEtagPersistMirror(etag: string | null): void {
  if (!isTreePersistMirrorEnabled()) {
    return;
  }
  try {
    if (etag) {
      localStorage.setItem(PERSIST_ETAG_KEY, etag);
    } else {
      localStorage.removeItem(PERSIST_ETAG_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function hasFileListTreeCache(): boolean {
  try {
    return sessionStorage.getItem(CACHE_KEY) != null;
  } catch {
    return false;
  }
}

/** 根节点改名等场景下就地更新列表缓存中的显示名，避免下次打开仍读到「未命名」。 */
export function patchFileListTreeCacheFileName(
  fileId: string,
  name: string,
): void {
  const tree = readFileListTreeCache();
  if (!tree) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }
  const index = tree.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return;
  }
  if (tree.files[index].name === trimmed) {
    return;
  }
  const nextFiles = [...tree.files];
  nextFiles[index] = { ...nextFiles[index], name: trimmed };
  writeFileListTreeCache({ folders: tree.folders, files: nextFiles });
}

/**
 * 缩略图 404 后修正本 tab 的列表缓存，避免首页再次用旧 has_thumbnail
 * 乐观拉取同一版本的缺失缩略图。
 */
export function patchFileListTreeCacheThumbnailMissing(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  const tree = readFileListTreeCache();
  if (!tree) {
    return false;
  }
  const index = tree.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return false;
  }
  const file = tree.files[index];
  if (
    !file.has_thumbnail ||
    (file.content_sha256 ?? null) !== (contentSha ?? null)
  ) {
    return false;
  }
  const nextFiles = [...tree.files];
  nextFiles[index] = { ...file, has_thumbnail: false };
  writeFileListTreeCache({ folders: tree.folders, files: nextFiles });
  return true;
}

export function patchFileListTreeCacheSavedFile(
  fileId: string,
  patch: Partial<
    Pick<
      ServerFile,
      | "name"
      | "kind"
      | "has_thumbnail"
      | "content_sha256"
      | "version"
      | "updated_at"
    >
  >,
): boolean {
  const tree = readFileListTreeCache();
  if (!tree) {
    return false;
  }
  const index = tree.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return false;
  }
  const nextPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<ServerFile>;
  const nextFiles = [...tree.files];
  nextFiles[index] = { ...nextFiles[index], ...nextPatch };
  writeFileListTreeCache({ folders: tree.folders, files: nextFiles });
  writeFileListTreeCacheEtag(null);
  return true;
}
