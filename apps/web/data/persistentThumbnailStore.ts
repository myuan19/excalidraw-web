/**
 * 桌面端缩略图跨会话持久层（IndexedDB，contentSha 绑定）。
 *
 * Web 端浏览器 HTTP 磁盘缓存已按 `Cache-Control: immutable`（GET /thumbnail?h=）
 * 天然持久，重开页面秒出；桌面端 API 走 IPC → loopback Express，链路上没有任何
 * HTTP 缓存，且 sessionStorage 每次启动为空，导致每次启动全量重拉。本模块对齐
 * 两端：桌面端把 contentSha 绑定的已保存缩略图落到 IndexedDB，启动时由
 * {@link ./thumbnailWarmStart} 水合回 session 缓存。
 *
 * 分层约束（避免环依赖）：本模块是纯存储层，只依赖 idb-keyval / runtimePlatform /
 * logger，不 import 其他 data/ 模块；写入方（localThumbnailCache、useThumbnailPipeline）
 * 与水合编排（thumbnailWarmStart）单向依赖本模块。
 *
 * 失效语义与 Web 端 HTTP 缓存一致：key 为 fileId，值绑定 contentSha；内容变化后
 * 读取方按新 sha 取图自然 miss，由服务器拉取覆盖。Web 端本模块整体 no-op。
 */

import { createStore, del, entries, set, clear } from "idb-keyval";

import { createLogger } from "../lib/logger";
import { isDesktopEditorHub } from "../lib/runtimePlatform";

const log = createLogger({ module: "thumbnail" });

const IDB_NAME = "excalidraw-thumb-persist";
/** 与 sessionStorage 槽一致的单图上限（normalize 后字符数） */
const MAX_SVG_CHARS = 150_000;
/** 超龄条目在启动清理时删除（内容仍在用会被拉取后重新落盘，自愈） */
const MAX_ENTRY_AGE_MS = 60 * 24 * 60 * 60 * 1000;
/** 条目数上限，按最近写入保留 */
const MAX_ENTRIES = 500;

export type PersistedThumbnailEntry = {
  fileId: string;
  contentSha: string;
  svg: string;
  /** epoch ms，最近一次落盘时间 */
  at: number;
};

type StoredValue = {
  sha: string;
  svg: string;
  at: number;
};

let idbStore: ReturnType<typeof createStore> | null = null;

function getStore(): ReturnType<typeof createStore> | null {
  if (idbStore) {
    return idbStore;
  }
  try {
    if (typeof indexedDB === "undefined") {
      return null;
    }
    idbStore = createStore(`${IDB_NAME}-db`, `${IDB_NAME}-store`);
    return idbStore;
  } catch {
    return null;
  }
}

/** 同会话去重：fileId → 已落盘的 contentSha，避免重复 IDB 写。 */
const persistedShaByFileId = new Map<string, string>();

export function isPersistentThumbnailStoreEnabled(): boolean {
  return isDesktopEditorHub() && typeof indexedDB !== "undefined";
}

/** 水合时登记已有条目，让后续同 sha 的写入直接跳过。 */
export function notePersistedThumbnail(fileId: string, contentSha: string): void {
  persistedShaByFileId.set(fileId, contentSha);
}

/**
 * 落盘一张已保存（contentSha 绑定）的缩略图。fire-and-forget，失败静默：
 * 持久层只是加速缓存，任何异常都回退到服务器拉取路径。
 */
export function persistSavedThumbnail(
  fileId: string,
  contentSha: string | null | undefined,
  svg: string | null | undefined,
): void {
  if (!isPersistentThumbnailStoreEnabled()) {
    return;
  }
  if (!contentSha || !svg || svg.length > MAX_SVG_CHARS) {
    return;
  }
  if (persistedShaByFileId.get(fileId) === contentSha) {
    return;
  }
  const store = getStore();
  if (!store) {
    return;
  }
  persistedShaByFileId.set(fileId, contentSha);
  const value: StoredValue = { sha: contentSha, svg, at: Date.now() };
  void set(fileId, value, store).catch(() => {
    // quota / 隐私模式 / IDB 异常：撤销登记，后续写入可重试
    if (persistedShaByFileId.get(fileId) === contentSha) {
      persistedShaByFileId.delete(fileId);
    }
  });
}

/** 文件删除 / 会话清理时移除持久条目。fire-and-forget。 */
export function deletePersistedThumbnail(fileId: string): void {
  if (!isPersistentThumbnailStoreEnabled()) {
    return;
  }
  persistedShaByFileId.delete(fileId);
  const store = getStore();
  if (!store) {
    return;
  }
  void del(fileId, store).catch(() => {
    /* ignore */
  });
}

function isValidStoredValue(value: unknown): value is StoredValue {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Partial<StoredValue>;
  return (
    typeof v.sha === "string" &&
    v.sha.length > 0 &&
    typeof v.svg === "string" &&
    v.svg.length > 0 &&
    typeof v.at === "number"
  );
}

/**
 * 读出全部有效条目（按 at 降序），并在后台清理超龄/超量/损坏条目。
 * 仅在启动水合时调用一次。
 */
export async function readAllPersistedThumbnails(): Promise<
  PersistedThumbnailEntry[]
> {
  if (!isPersistentThumbnailStoreEnabled()) {
    return [];
  }
  const store = getStore();
  if (!store) {
    return [];
  }
  let all: [IDBValidKey, unknown][];
  try {
    all = await entries(store);
  } catch {
    return [];
  }
  const now = Date.now();
  const valid: PersistedThumbnailEntry[] = [];
  const staleKeys: IDBValidKey[] = [];
  for (const [key, value] of all) {
    if (
      typeof key !== "string" ||
      !isValidStoredValue(value) ||
      value.svg.length > MAX_SVG_CHARS ||
      now - value.at > MAX_ENTRY_AGE_MS
    ) {
      staleKeys.push(key);
      continue;
    }
    valid.push({
      fileId: key,
      contentSha: value.sha,
      svg: value.svg,
      at: value.at,
    });
  }
  valid.sort((a, b) => b.at - a.at);
  const overflow = valid.splice(MAX_ENTRIES);
  for (const entry of overflow) {
    staleKeys.push(entry.fileId);
  }
  if (staleKeys.length > 0) {
    void Promise.all(staleKeys.map((key) => del(key, store))).catch(() => {
      /* ignore */
    });
    log.debug("persistent thumb prune", {
      pruned: staleKeys.length,
      kept: valid.length,
    });
  }
  return valid;
}

/** 清空持久层（测试/设置项用）。 */
export async function clearAllPersistedThumbnails(): Promise<void> {
  persistedShaByFileId.clear();
  const store = getStore();
  if (!store) {
    return;
  }
  try {
    await clear(store);
  } catch {
    /* ignore */
  }
}
