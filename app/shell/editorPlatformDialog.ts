export type EditorPlatformConfirmAction = "primary" | "secondary" | "cancel";

export type EditorPlatformConfirmVariant = "primary" | "danger";

export type EditorPlatformConfirmRequest = {
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel?: string;
  cancelLabel?: string;
  primaryVariant?: EditorPlatformConfirmVariant;
  secondaryVariant?: EditorPlatformConfirmVariant;
  busy?: boolean;
  /** 点击遮罩时的行为，默认 cancel */
  dismissOnOverlay?: boolean;
};

export const EDITOR_PLATFORM_CONFIRM_OPEN = "editor-platform-confirm-open";
export const EDITOR_PLATFORM_CONFIRM_CLOSE = "editor-platform-confirm-close";

type OpenDetail = EditorPlatformConfirmRequest;

let pendingResolve: ((action: EditorPlatformConfirmAction) => void) | null =
  null;
let pendingRequest: EditorPlatformConfirmRequest | null = null;

export function peekEditorPlatformConfirmRequest(): EditorPlatformConfirmRequest | null {
  return pendingRequest;
}

export function requestEditorPlatformConfirm(
  request: EditorPlatformConfirmRequest,
): Promise<EditorPlatformConfirmAction> {
  if (pendingResolve) {
    return Promise.reject(new Error("editor platform confirm already pending"));
  }
  pendingRequest = request;
  return new Promise((resolve) => {
    pendingResolve = resolve;
    window.dispatchEvent(
      new CustomEvent<OpenDetail>(EDITOR_PLATFORM_CONFIRM_OPEN, {
        detail: request,
      }),
    );
  });
}

export function completeEditorPlatformConfirm(
  action: EditorPlatformConfirmAction,
): void {
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingRequest = null;
  window.dispatchEvent(new CustomEvent(EDITOR_PLATFORM_CONFIRM_CLOSE));
  resolve?.(action);
}

export function subscribeEditorPlatformConfirmOpen(
  handler: (request: EditorPlatformConfirmRequest) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<OpenDetail>).detail;
    if (detail) {
      handler(detail);
    }
  };
  window.addEventListener(EDITOR_PLATFORM_CONFIRM_OPEN, listener);
  return () => window.removeEventListener(EDITOR_PLATFORM_CONFIRM_OPEN, listener);
}

export function subscribeEditorPlatformConfirmClose(
  handler: () => void,
): () => void {
  window.addEventListener(EDITOR_PLATFORM_CONFIRM_CLOSE, handler);
  return () =>
    window.removeEventListener(EDITOR_PLATFORM_CONFIRM_CLOSE, handler);
}
