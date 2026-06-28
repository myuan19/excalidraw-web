import { useEffect, useRef } from "react";

export type EditorPaneLifecycleOptions = {
  /** Whether this cached pane is the foreground editor tab. */
  isForeground: boolean;
  onForeground?: () => void;
  onBackground?: () => void;
};

/**
 * Foreground / background transitions for cached editor panes.
 * EditorPaneStack sets `isPaneForeground`; shells wire resume hooks here.
 */
export function useEditorPaneLifecycle({
  isForeground,
  onForeground,
  onBackground,
}: EditorPaneLifecycleOptions): void {
  const wasForegroundRef = useRef(isForeground);
  const onForegroundRef = useRef(onForeground);
  const onBackgroundRef = useRef(onBackground);
  onForegroundRef.current = onForeground;
  onBackgroundRef.current = onBackground;

  useEffect(() => {
    const wasForeground = wasForegroundRef.current;
    if (isForeground && !wasForeground) {
      onForegroundRef.current?.();
    } else if (!isForeground && wasForeground) {
      onBackgroundRef.current?.();
    }
    wasForegroundRef.current = isForeground;
  }, [isForeground]);
}

/**
 * Defer iframe / heavy runtime mount until the pane has been foreground at least once.
 */
export function useEditorPaneMountGate(isForeground: boolean): boolean {
  const mountedRef = useRef(isForeground);
  if (isForeground) {
    mountedRef.current = true;
  }
  return mountedRef.current;
}
