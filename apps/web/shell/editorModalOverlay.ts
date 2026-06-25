import { useEffect } from "react";

export const EDITOR_MODAL_OVERLAY_CHANGE = "editor-modal-overlay-change";

let overlayCount = 0;

export function isEditorModalOverlayOpen(): boolean {
  return overlayCount > 0;
}

export function notifyEditorModalOverlay(open: boolean): void {
  overlayCount = Math.max(0, open ? overlayCount + 1 : overlayCount - 1);
  window.dispatchEvent(
    new CustomEvent<{ open: boolean }>(EDITOR_MODAL_OVERLAY_CHANGE, {
      detail: { open: overlayCount > 0 },
    }),
  );
}

export function subscribeEditorModalOverlayChange(
  handler: (open: boolean) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ open: boolean }>).detail;
    handler(!!detail?.open);
  };
  window.addEventListener(EDITOR_MODAL_OVERLAY_CHANGE, listener);
  return () =>
    window.removeEventListener(EDITOR_MODAL_OVERLAY_CHANGE, listener);
}

/** Register a modal/dialog while `open` is true (nested dialogs use a ref counter). */
export function useEditorModalOverlayRegistration(open: boolean): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    notifyEditorModalOverlay(true);
    return () => {
      notifyEditorModalOverlay(false);
    };
  }, [open]);
}
