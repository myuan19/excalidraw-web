import { afterEach, describe, expect, it, vi } from "vitest";

import { editorRegistry } from "../editors/registry";

import {
  applyAppShellPendingNavigation,
  clearAppShellPendingNavigation,
  dispatchAppShellNavigate,
  peekAppShellPendingNavigation,
  runAppShellPendingNavigation,
} from "./appShellNavigate";
import { APP_SHELL_GO_HOME } from "./Sidebar";

describe("appShellNavigate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAppShellPendingNavigation();
    window.location.hash = "";
  });

  it("dispatchAppShellNavigate emits openFile detail", () => {
    const handler = vi.fn();
    window.addEventListener(APP_SHELL_GO_HOME, handler);
    dispatchAppShellNavigate({ openFile: { id: "file-a", kind: "excalidraw" } });
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      openFile: { id: "file-a", kind: "excalidraw" },
    });
    window.removeEventListener(APP_SHELL_GO_HOME, handler);
  });

  it("applyAppShellPendingNavigation assigns file hash navigation", () => {
    const skip = { current: false };
    let pending: (() => void) | null = null;
    applyAppShellPendingNavigation(
      { openFile: { id: "file-b", kind: "mindmap" } },
      skip,
      (fn) => {
        pending = fn;
      },
    );
    expect(peekAppShellPendingNavigation()?.openFile).toEqual({
      id: "file-b",
      kind: "mindmap",
    });
    expect(pending).toBeTypeOf("function");
    pending!();
    expect(skip.current).toBe(true);
    expect(window.location.hash).toBe(
      editorRegistry.buildFileHash("file-b", "mindmap"),
    );
    expect(peekAppShellPendingNavigation()).toBeNull();
  });

  it("runAppShellPendingNavigation applies stored openFile after assignNavigate", () => {
    const skip = { current: false };
    applyAppShellPendingNavigation(
      { openFile: { id: "file-c", kind: "excalidraw" } },
      skip,
      () => {},
    );
    runAppShellPendingNavigation(skip);
    expect(window.location.hash).toBe(
      editorRegistry.buildFileHash("file-c", "excalidraw"),
    );
  });
});
