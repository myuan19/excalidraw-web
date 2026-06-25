/**
 * Fork 私有部署：画布文件相关的持久化与传输数据结构。
 *
 * 层次：
 * - 服务器 `ServerFile.data`：当前兼容 Excalidraw 场景 JSON，后续可演进为 ManagedDocument。
 * - 浏览器 localStorage（FileSyncState）：按 fileId 存的「本地草稿」{@link ForkLocalCacheRecord}，
 *   在**未保存到服务器**期间随编辑防抖写入（与画布一致）+ 增量 deltas；另存 draft/baseline 哈希键用于「未保存」判断。
 * - 浏览器 sessionStorage（LocalThumbnailCache）：列表预览用 SVG，与会话绑定。
 */

import {
  normalizeDocument,
  type ManagedDocument,
} from "./documentTypes";

/** 与 API GET/PUT `data` 字段及 serialize/hash 管线一致的场景快照。 */
export interface ForkSceneSnapshot {
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
}

/**
 * 本地缓存一条记录（localStorage `excalidraw-file-local-cache-${fileId}`）。
 * `deltas` 与 DeltaStorage 对齐，用于恢复增量历史；紧急落盘可为空数组。
 */
export type ForkLocalCacheMeta = {
  /** 与服务器 files.content_sha256 对齐，用于重开时校验 cache 正文是否过期 */
  serverContentSha256?: string;
  /** 与服务器 files.version 对齐，用于保存前构造 expectedVersion */
  serverVersion?: number;
};

export interface ForkLocalCacheRecord extends ForkSceneSnapshot {
  document?: ManagedDocument;
  deltas: unknown[];
  meta?: ForkLocalCacheMeta;
}

const LOCAL_CACHE_SCHEMA = 1 as const;

/** 写入时可带版本字段，便于日后迁移；解析时兼容无 `v` 的旧数据。 */
export type ForkLocalCacheStored =
  | ForkLocalCacheRecord
  | { v: number; payload: ForkLocalCacheRecord };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** 从 JSON 解析结果得到本地缓存；无法识别则返回 null。 */
export function parseForkLocalCache(raw: unknown): ForkLocalCacheRecord | null {
  if (!isRecord(raw)) {
    return null;
  }

  let body: Record<string, unknown> = raw;
  if (typeof raw.v === "number" && raw.payload && isRecord(raw.payload)) {
    body = raw.payload as Record<string, unknown>;
  }

  const document = normalizeDocument(body.document) ?? normalizeDocument(body);
  if (!document || !isRecord(document.data)) {
    return null;
  }

  const scene =
    document.kind === "excalidraw"
      ? (document.data as Record<string, unknown>)
      : {};
  const deltasRaw = body.deltas;
  const deltas = Array.isArray(deltasRaw) ? deltasRaw : [];

  const metaRaw = body.meta;
  const meta =
    isRecord(metaRaw) &&
    ((typeof metaRaw.serverContentSha256 === "string" &&
      metaRaw.serverContentSha256) ||
      (typeof metaRaw.serverVersion === "number" &&
        Number.isInteger(metaRaw.serverVersion)))
      ? {
          ...(typeof metaRaw.serverContentSha256 === "string" &&
          metaRaw.serverContentSha256
            ? { serverContentSha256: metaRaw.serverContentSha256 }
            : {}),
          ...(typeof metaRaw.serverVersion === "number" &&
          Number.isInteger(metaRaw.serverVersion)
            ? { serverVersion: metaRaw.serverVersion }
            : {}),
        }
      : undefined;

  return {
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
    document,
    deltas,
    ...(meta ? { meta } : {}),
  };
}

/** 序列化写入用的对象（当前与 Flat 结构兼容，保留 `v` 方便以后扩展）。 */
export function toForkLocalCacheStored(
  record: ForkLocalCacheRecord,
): ForkLocalCacheStored {
  return { v: LOCAL_CACHE_SCHEMA, payload: record };
}
