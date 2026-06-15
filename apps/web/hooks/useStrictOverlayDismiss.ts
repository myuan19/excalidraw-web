import { useMemo, useRef } from "react";
import type { PointerEvent } from "react";

export type StrictOverlayDismissHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: () => void;
};

/**
 * 仅在按下与松手都点在遮罩上时关闭，避免在面板内选区/复制时松手落在外侧误关。
 */
export function useStrictOverlayDismiss(
  onDismiss: () => void,
): StrictOverlayDismissHandlers {
  const pointerDownOnBackdrop = useRef(false);
  return useMemo(
    () => ({
      onPointerDown: (e: PointerEvent) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      },
      onPointerUp: (e: PointerEvent) => {
        if (e.target === e.currentTarget && pointerDownOnBackdrop.current) {
          onDismiss();
        }
        pointerDownOnBackdrop.current = false;
      },
      onPointerCancel: () => {
        pointerDownOnBackdrop.current = false;
      },
    }),
    [onDismiss],
  );
}
