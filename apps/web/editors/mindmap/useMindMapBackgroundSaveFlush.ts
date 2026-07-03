import { useEffect, useRef, useState } from "react";

import { FileSyncState } from "../../data/FileSyncState";

/** FileSyncState.emitSyncState 广播的事件名（hash/localCache/localEditTime 变更）。 */
const FILE_SYNC_STATE_EVENT = "excalidraw-file-sync-state";

export type MindMapBackgroundSaveFlushOptions = {
  fileId: string | null;
  isPaneForeground: boolean;
  /** native 桥就绪后才请求保存，未就绪时等 ready 翻转再触发。 */
  isNativeReady: boolean;
  /** 冲刷入口（幂等：内部有脏检查，保存协调器对在途请求去重）。 */
  flush: (reason: string) => void;
};

/**
 * 后台 pane 的待保存冲刷 —— 状态驱动，而非前台→后台的边沿回调。
 *
 * 「切后台立即保存」如果只挂在 onPaneBackground 边沿上，会漏掉三类真实时序：
 * 1. 切后台瞬间 iframe 的草稿推送还在 postMessage 队列里，边沿回调执行时
 *    宿主还没记录到未保存状态，冲刷被脏检查拦下，保存退化为空闲计时器兜底；
 * 2. shell 以后台身份重新挂载（pane 重建、错误边界恢复），边沿从未发生；
 * 3. pane 已在后台期间才产生的编辑（保存响应链、AI 写入等）。
 *
 * 因此以状态不变量驱动：「pane 在后台 && 文件有未落盘编辑 && native 就绪」
 * 成立即触发一次冲刷。订阅 FileSyncState 变更事件感知迟到的草稿推送；
 * 保存完成 alignHashes 后不变量自然消失，不会重复保存。
 */
export function useMindMapBackgroundSaveFlush({
  fileId,
  isPaneForeground,
  isNativeReady,
  flush,
}: MindMapBackgroundSaveFlushOptions): void {
  const [syncRevision, setSyncRevision] = useState(0);
  /** 同一后台脏状态（draftHash）只冲刷一次：保存管线自身的写盘事件不再回声触发。 */
  const flushedDraftHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPaneForeground || !fileId) {
      // 回前台重置门闩：下次进后台的同名脏状态仍会冲刷。
      flushedDraftHashRef.current = null;
      return;
    }
    // 仅后台期间订阅：前台编辑会高频触发 sync-state，避免无谓重渲染。
    const bump = () => setSyncRevision((value) => value + 1);
    window.addEventListener(FILE_SYNC_STATE_EVENT, bump);
    return () => {
      window.removeEventListener(FILE_SYNC_STATE_EVENT, bump);
    };
  }, [fileId, isPaneForeground]);

  useEffect(() => {
    if (isPaneForeground || !fileId || !isNativeReady) {
      return;
    }
    if (!FileSyncState.hasUnsavedChanges(fileId)) {
      return;
    }
    const draftHash = FileSyncState.getDraftHash(fileId);
    if (draftHash && flushedDraftHashRef.current === draftHash) {
      return;
    }
    flushedDraftHashRef.current = draftHash;
    flush("pane-background-pending");
  }, [fileId, flush, isNativeReady, isPaneForeground, syncRevision]);
}
