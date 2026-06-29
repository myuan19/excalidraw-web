import { beforeEach, describe, expect, it, vi } from "vitest";

import { HOME_TAB_ID, writeEditorTabsState } from "../shell/editorTabs";
import { createHomeTab, createInitialEditorTabsState, openFileTab } from "../shell/editorTabs";

vi.mock("../lib/runtimePlatform", () => ({
  isDesktopEditorHub: () => true,
}));

vi.mock("../data/libraryUrlImport", () => ({
  stashLibraryUrlImportFromHash: vi.fn(),
}));

import { peekStartupShellMode, resolveStartupIntent } from "./StartupIntent";

describe("StartupIntent", () => {
  beforeEach(() => {
    window.location.hash = "";
    sessionStorage.clear();
    localStorage.clear();
    writeEditorTabsState(createInitialEditorTabsState());
  });

  it("peekStartupShellMode returns editor when a file tab is active on desktop", () => {
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-1",
        kind: "excalidraw",
        title: "Doc",
      }),
    );
    expect(peekStartupShellMode()).toBe("editor");
  });

  it("resolveStartupIntent restores editor intent without writing hash", () => {
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-1",
        kind: "mindmap",
        title: "Map",
      }),
    );
    const intent = resolveStartupIntent();
    expect(intent).toMatchObject({
      mode: "editor",
      fileId: "file-1",
      kind: "mindmap",
      needsSessionRestore: true,
    });
    expect(window.location.hash).toBe("");
  });

  it("resolveStartupIntent prefers hash editor route", () => {
    window.location.hash = "#file=abc123";
    writeEditorTabsState({
      activeTabId: HOME_TAB_ID,
      tabs: [createHomeTab()],
    });
    const intent = resolveStartupIntent();
    expect(intent).toMatchObject({
      mode: "editor",
      fileId: "abc123",
      needsSessionRestore: false,
    });
  });
});
