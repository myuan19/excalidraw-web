/**
 * 用户操作与缩略图展示决策的可检索 trace（写入 user-trace → desktop-op.log）。
 * 过滤：控制台 / 日志搜 `[DEBUG] user-trace | thumb` / `tab` / `file` / `saveFlow`
 */
import { traceUserAction, type TracePhase } from "./userTrace";

export function id8(fileId?: string | null): string | null {
  if (!fileId) {
    return null;
  }
  return fileId.length <= 8 ? fileId : fileId.slice(0, 8);
}

export function traceThumb(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "ok",
): void {
  traceUserAction("thumb", action, data, phase);
}

export function traceTab(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "start",
): void {
  traceUserAction("tab", action, data, phase);
}

export function traceFileOpen(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "start",
): void {
  traceUserAction("file", action, data, phase);
}

export function traceSaveFlow(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "start",
): void {
  traceUserAction("saveFlow", action, data, phase);
}

/** 缩略图卡片最终展示态（是否显示图 / loading / 角标） */
export function traceThumbCardDisplay(data: {
  fileId: string;
  kind?: string | null;
  syncState?: string | null;
  listLocalPolicy?: string | null;
  finalSource?: string | null;
  badge?: string | null;
  hasCardThumb?: boolean;
  thumbLoading?: boolean;
  thumbSwitchLoading?: boolean;
  savePending?: boolean;
  contentSha8?: string | null;
  hasServerThumbFlag?: boolean;
  fetchedLen?: number;
  localLen?: number;
  reasons?: string[];
}): void {
  traceThumb(
    "cardDisplay",
    {
      fileId8: id8(data.fileId),
      kind: data.kind ?? null,
      syncState: data.syncState ?? null,
      listLocalPolicy: data.listLocalPolicy ?? null,
      finalSource: data.finalSource ?? null,
      badge: data.badge ?? null,
      hasCardThumb: data.hasCardThumb ?? false,
      thumbLoading: data.thumbLoading ?? false,
      thumbSwitchLoading: data.thumbSwitchLoading ?? false,
      savePending: data.savePending ?? false,
      contentSha8: data.contentSha8 ?? null,
      hasServerThumbFlag: data.hasServerThumbFlag ?? false,
      fetchedLen: data.fetchedLen ?? 0,
      localLen: data.localLen ?? 0,
      reasons: data.reasons ?? [],
    },
    "ok",
  );
}
