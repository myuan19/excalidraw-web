/**
 * 桌面端启动水合：把 IndexedDB 持久层的缩略图批量还原到 sessionStorage saved 槽。
 *
 * 还原后所有既有读取路径（列表卡片 resolveListCardLocalThumb、pipeline 的
 * LocalThumbnailCache.getForContent 短路）原样生效——卡片首帧即出图、
 * GET /thumbnail 只发给真正没有本地图的文件，与 Web 端命中浏览器 HTTP
 * 缓存的表现一致。Web / 嵌入 iframe 下为 no-op。
 */

import { createLogger } from "../lib/logger";
import { isEmbedMode } from "../embed/embedMode";

import {
  LOCAL_THUMB_UPDATED_EVENT,
  LocalThumbnailCache,
} from "./localThumbnailCache";
import {
  isPersistentThumbnailStoreEnabled,
  notePersistedThumbnail,
  readAllPersistedThumbnails,
} from "./persistentThumbnailStore";

const log = createLogger({ module: "thumbnail" });

/**
 * sessionStorage 写入总预算（字符数）。树缓存可达 1-2MB，Chromium 单 origin
 * 配额 ~10MB；超预算的条目留在 IndexedDB，不进 session（拉取路径兜底）。
 */
const SESSION_RESTORE_BUDGET_CHARS = 3_000_000;

let warmStartPromise: Promise<number> | null = null;

/** 幂等：返回还原进 session 的条目数。 */
export function warmStartPersistedThumbnails(): Promise<number> {
  if (warmStartPromise) {
    return warmStartPromise;
  }
  warmStartPromise = runWarmStart().catch((error) => {
    log.debug("thumb warm start failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  });
  return warmStartPromise;
}

async function runWarmStart(): Promise<number> {
  if (!isPersistentThumbnailStoreEnabled() || isEmbedMode()) {
    return 0;
  }
  const t0 = performance.now();
  const entriesList = await readAllPersistedThumbnails();
  if (entriesList.length === 0) {
    return 0;
  }
  let restored = 0;
  let budget = SESSION_RESTORE_BUDGET_CHARS;
  for (const entry of entriesList) {
    // 无论是否进 session，都登记 sha：条目已在持久层，避免会话内重复回写。
    notePersistedThumbnail(entry.fileId, entry.contentSha);
    if (entry.svg.length > budget) {
      continue;
    }
    if (
      LocalThumbnailCache.restoreSavedContentThumb(
        entry.fileId,
        entry.contentSha,
        entry.svg,
      )
    ) {
      restored += 1;
      budget -= entry.svg.length;
    }
  }
  if (restored > 0) {
    // 批量还原只发一次事件（restoreSavedContentThumb 不逐条发），
    // 列表/侧栏监听后整体刷新，避免启动期 N 次重渲染。
    window.dispatchEvent(
      new CustomEvent(LOCAL_THUMB_UPDATED_EVENT, {
        detail: { fileId: null, bulkRestore: true },
      }),
    );
  }
  log.info("thumb warm start", {
    persisted: entriesList.length,
    restored,
    ms: Math.round(performance.now() - t0),
  });
  return restored;
}

/** @internal test helper */
export function resetThumbnailWarmStartForTests(): void {
  warmStartPromise = null;
}
