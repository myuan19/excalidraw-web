export const APP_NOTICE_EVENT = "drawing-space-app-notice";

export type AppNoticeLevel = "info" | "warning" | "error";

export interface AppNoticePayload {
  level: AppNoticeLevel;
  message: string;
  key?: string;
}

export function emitAppNotice(payload: AppNoticePayload) {
  window.dispatchEvent(new CustomEvent(APP_NOTICE_EVENT, { detail: payload }));
}
