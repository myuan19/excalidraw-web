import { useCallback, useEffect, useRef } from "react";

import { NATIVE_HYDRATE_SETTLE_MS } from "./mindMapDraftState";

type UseMindMapNativeHydrateOpts = {
  onSettleEnd?: () => void;
  onSettleExtended?: (reason: string) => void;
  onSettleComplete?: (reason: string) => void;
};

/**
 * 管理 iframe 打开后的 hydrate settle 窗口。
 * 在窗口内抑制 dirty 通知，并以最后一次 draft push 为锚滑动延长计时。
 */
export function useMindMapNativeHydrate(opts: UseMindMapNativeHydrateOpts = {}) {
  const isHydratingRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const settleReasonRef = useRef("init");
  const onSettleEndRef = useRef(opts.onSettleEnd);
  const onSettleExtendedRef = useRef(opts.onSettleExtended);
  const onSettleCompleteRef = useRef(opts.onSettleComplete);

  useEffect(() => {
    onSettleEndRef.current = opts.onSettleEnd;
    onSettleExtendedRef.current = opts.onSettleExtended;
    onSettleCompleteRef.current = opts.onSettleComplete;
  }, [opts.onSettleEnd, opts.onSettleExtended, opts.onSettleComplete]);

  const clearSettleTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const extendSettle = useCallback(
    (reason: string) => {
      isHydratingRef.current = true;
      settleReasonRef.current = reason;
      clearSettleTimer();
      onSettleExtendedRef.current?.(reason);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        isHydratingRef.current = false;
        const completedReason = settleReasonRef.current;
        onSettleEndRef.current?.();
        onSettleCompleteRef.current?.(completedReason);
      }, NATIVE_HYDRATE_SETTLE_MS);
    },
    [clearSettleTimer],
  );

  const dispose = useCallback(() => {
    clearSettleTimer();
  }, [clearSettleTimer]);

  return { isHydratingRef, extendSettle, dispose };
}
