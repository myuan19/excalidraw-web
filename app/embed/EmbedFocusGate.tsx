import { useCallback, useEffect, useRef, useState } from "react";
import { embedDebug } from "./embedDebug";

export function useEmbedPinState() {
  const [isPinned, setIsPinned] = useState(true);
  const isPinnedRef = useRef(true);

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  const pin = useCallback(() => {
    embedDebug("pin state: pin");
    setIsPinned(true);
  }, []);

  const unpin = useCallback(() => {
    embedDebug("pin state: unpin");
    setIsPinned(false);
  }, []);

  const togglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      embedDebug("pin state: toggle", { from: prev, to: next });
      return next;
    });
  }, []);

  return { isPinned, isPinnedRef, pin, unpin, togglePin };
}

/**
 * Auto re-lock the embed when user attention leaves the container:
 * - pointerdown outside the container element
 * - window loses focus to an ancestor frame or another tab
 * - page visibility changes (tab switch / minimize)
 */
export function useEmbedAutoLock(
  isPinned: boolean,
  pin: () => void,
  containerRef: { current: HTMLElement | null },
) {
  useEffect(() => {
    if (isPinned) return;

    let mounted = true;

    const handlePointerDown = (e: PointerEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(e.target as Node)) {
        embedDebug("auto-lock: click outside container");
        pin();
      }
    };

    const handleWindowBlur = () => {
      requestAnimationFrame(() => {
        if (!mounted) return;
        if (document.hasFocus()) {
          // Focus moved to a child iframe within this page — keep unlocked
          return;
        }
        embedDebug("auto-lock: focus left page");
        pin();
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        embedDebug("auto-lock: tab hidden");
        pin();
      }
    };

    // Delay listener registration so the click that just unlocked us
    // doesn't immediately re-lock via the pointerdown handler.
    const timer = setTimeout(() => {
      if (!mounted) return;
      document.addEventListener("pointerdown", handlePointerDown, true);
      window.addEventListener("blur", handleWindowBlur);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }, 60);

    return () => {
      mounted = false;
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPinned, pin, containerRef]);
}
