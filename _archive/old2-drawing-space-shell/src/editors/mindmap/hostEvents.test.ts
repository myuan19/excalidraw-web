import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitMindMapHostSaveStatus,
  requestMindMapHostSave,
} from "./hostEvents";

describe("MindMap host events", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches a host save request event for native save actions", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener("mindmap-host-request-save", listener);

    requestMindMapHostSave(target);

    expect(listener).toHaveBeenCalledTimes(1);
    target.removeEventListener("mindmap-host-request-save", listener);
  });

  it("dispatches save status payloads to the MindMap host", () => {
    const target = new EventTarget();
    let detail: unknown = null;
    const listener = vi.fn((event: Event) => {
      detail = (event as CustomEvent).detail;
    });
    target.addEventListener("mindmap-host-save-status", listener);

    emitMindMapHostSaveStatus({
      saving: true,
      status: "saving",
      message: "保存中",
    }, target);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(detail).toEqual({
      saving: true,
      status: "saving",
      message: "保存中",
    });
    target.removeEventListener("mindmap-host-save-status", listener);
  });
});
