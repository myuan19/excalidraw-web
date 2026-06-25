import { afterEach, describe, expect, it, vi } from "vitest";

import { editorRegistry } from "../editors/registry";

import {
  APP_SHELL_PENDING_NAVIGATION_CHANGE,
  applyAppShellPendingNavigation,
  clearAppShellPendingNavigation,
  dispatchAppShellNavigate,
  type AppShellPendingNavigationChangeDetail,
  peekAppShellPendingNavigation,
  runAppShellPendingNavigation,
} from "./appShellNavigate";
import {
  createInitialEditorTabsState,
  EDITOR_TABS_STORAGE_KEY,
  openFileTab,
  writeEditorTabsState,
} from "./editorTabs";
import { APP_SHELL_GO_HOME } from "./Sidebar";
import { buildViewHash } from "./useAppView";

describe("appShellNavigate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAppShellPendingNavigation();
    sessionStorage.clear();
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

  it("emits pending navigation changes for set, run, and clear", () => {
    const skip = { current: false };
    const handler = vi.fn();
    window.addEventListener(APP_SHELL_PENDING_NAVIGATION_CHANGE, handler);

    applyAppShellPendingNavigation(
      { openFile: { id: "file-b", kind: "mindmap" } },
      skip,
      () => {},
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(
      (handler.mock.calls[0][0] as CustomEvent<AppShellPendingNavigationChangeDetail>)
        .detail,
    ).toEqual({
      pending: { openFile: { id: "file-b", kind: "mindmap" } },
      consumed: null,
      reason: "set",
    });

    runAppShellPendingNavigation(skip);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(
      (handler.mock.calls[1][0] as CustomEvent<AppShellPendingNavigationChangeDetail>)
        .detail,
    ).toEqual({
      pending: null,
      consumed: { openFile: { id: "file-b", kind: "mindmap" } },
      reason: "run",
    });

    applyAppShellPendingNavigation(
      { openFile: { id: "file-c", kind: "excalidraw" } },
      skip,
      () => {},
    );
    clearAppShellPendingNavigation();
    expect(
      (handler.mock.calls[3][0] as CustomEvent<AppShellPendingNavigationChangeDetail>)
        .detail,
    ).toEqual({
      pending: null,
      consumed: null,
      reason: "clear",
    });

    window.removeEventListener(APP_SHELL_PENDING_NAVIGATION_CHANGE, handler);
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

  it("activates the home tab when pending navigation targets a file-list view", () => {
    const skip = { current: false };
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-a",
        kind: "mindmap",
        title: "A",
      }),
    );

    applyAppShellPendingNavigation({ target: "files" }, skip, () => {});
    runAppShellPendingNavigation(skip);

    const tabs = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(window.location.hash).toBe(`#${buildViewHash("files")}`);
    expect(tabs.activeTabId).toBe("home");
  });
});
