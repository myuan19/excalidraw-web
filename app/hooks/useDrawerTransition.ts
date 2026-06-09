import { useCallback, useEffect, useRef, useState } from "react";
import type { TransitionEvent } from "react";

/** 抽屉遮罩与面板共用的过渡时长（须与 SettingsPanel.scss 中 --settings-drawer-duration 一致） */
export const DRAWER_TRANSITION_MS = 280;

/**
 * 控制右侧抽屉的挂载、展开与收起过渡。
 * 展开：先挂载闭合态，下一帧再加 --active 触发同步过渡。
 * 收起：移除 --active 后等待过渡结束再卸载。
 */
export function useDrawerTransition(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [active, setActive] = useState(false);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setActive(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setActive(false);
  }, [open]);

  useEffect(() => {
    if (!mounted || active || open) {
      return;
    }
    const timer = window.setTimeout(() => {
      setMounted(false);
    }, DRAWER_TRANSITION_MS + 40);
    return () => window.clearTimeout(timer);
  }, [mounted, active, open]);

  const onDrawerTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLElement>) => {
      if (e.propertyName !== "transform" || e.target !== e.currentTarget) {
        return;
      }
      if (!activeRef.current && !open) {
        setMounted(false);
      }
    },
    [open],
  );

  return { mounted, active, onDrawerTransitionEnd };
}
