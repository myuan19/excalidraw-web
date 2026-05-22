export const MINDMAP_HOST_REQUEST_SAVE_EVENT = "mindmap-host-request-save";
export const MINDMAP_HOST_SAVE_STATUS_EVENT = "mindmap-host-save-status";

export type MindMapHostSaveStatus = "idle" | "saving" | "saved" | "draft" | "error";

export interface MindMapHostSaveStatusPayload {
  saving: boolean;
  status: MindMapHostSaveStatus;
  message?: string;
  error?: string | null;
}

type EventTargetLike = Pick<EventTarget, "dispatchEvent">;

function createCustomEvent<T>(type: string, detail?: T): Event {
  if (typeof CustomEvent !== "undefined") {
    return new CustomEvent(type, { detail });
  }
  const event = new Event(type) as Event & { detail?: T };
  event.detail = detail;
  return event;
}

export function requestMindMapHostSave(target: EventTargetLike = window) {
  target.dispatchEvent(createCustomEvent(MINDMAP_HOST_REQUEST_SAVE_EVENT));
}

export function emitMindMapHostSaveStatus(
  payload: MindMapHostSaveStatusPayload,
  target: EventTargetLike = window,
) {
  target.dispatchEvent(createCustomEvent(MINDMAP_HOST_SAVE_STATUS_EVENT, payload));
}
