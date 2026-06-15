import { useCallback, useEffect, useRef, useState } from "react";
import { embedDebug } from "./embedDebug";

/** Interaction mask: blocked until user clicks the embed; not a view "pin". */
export function useEmbedPinState() {
  const [isPinned, setIsPinned] = useState(true);
  const isPinnedRef = useRef(true);

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  const pin = useCallback(() => {
    embedDebug("interaction mask: show");
    setIsPinned(true);
  }, []);

  const unpin = useCallback(() => {
    embedDebug("interaction mask: dismiss");
    setIsPinned(false);
  }, []);

  return { isPinned, isPinnedRef, pin, unpin };
}

/**
 * Re-show the interaction mask when user attention leaves the container:
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

/** MindMap embed: iframe steals focus; re-mask when the inner frame blurs. */
export function useEmbedIframeAutoLock(
  isLocked: boolean,
  lock: () => void,
  containerRef: { current: HTMLElement | null },
  iframeRef: { current: HTMLIFrameElement | null },
) {
  useEmbedAutoLock(isLocked, lock, containerRef);

  useEffect(() => {
    if (isLocked) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    let mounted = true;

    const handleIframeBlur = () => {
      requestAnimationFrame(() => {
        if (!mounted || isLocked) {
          return;
        }
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.closest(".embed-viewer-controls")
        ) {
          return;
        }
        embedDebug("auto-lock: mindmap iframe blur");
        lock();
      });
    };

    iframe.addEventListener("blur", handleIframeBlur);
    return () => {
      mounted = false;
      iframe.removeEventListener("blur", handleIframeBlur);
    };
  }, [isLocked, lock, iframeRef]);
}
