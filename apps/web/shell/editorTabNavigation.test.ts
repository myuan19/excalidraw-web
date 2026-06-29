import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInitialEditorTabsState,
  EDITOR_TABS_STORAGE_KEY,
  fileTabId,
  HOME_TAB_ID,
  openFileTab,
  readEditorTabsState,
  replaceFileTab,
  writeEditorTabsState,
} from "./editorTabs";

const prepareEditorTabForClose = vi.fn(async () => true);
vi.mock("../data/editorTabLeave", () => ({
  prepareEditorTabForClose: (...args: unknown[]) =>
    prepareEditorTabForClose(...args),
}));
import {
  activateEditorTab,
  closeEditorTabWithSnapshot,
  openEditorFileTab,
  reconcileEditorTabsWithHash,
  removeMissingEditorFileTab,
  renameOpenFileTab,
  replaceOpenFileTabAfterSave,
  refreshOpenFileTabTitle,
  restoreDesktopEditorSession,
} from "./editorTabNavigation";
import * as runtimePlatform from "../lib/runtimePlatform";

const snapshot = vi.fn(async (): Promise<{ ok: boolean; reason?: string }> => ({
  ok: true,
}));
const setHash = vi.fn();

describe("editorTabNavigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(runtimePlatform, "isDesktopEditorHub").mockReturnValue(false);
    prepareEditorTabForClose.mockResolvedValue(true);
    writeEditorTabsState(createInitialEditorTabsState());
  });

  it("openEditorFileTab records the opened file in recent", async () => {
    localStorage.removeItem("editorhub-recent-files-v1");

    await openEditorFileTab(
      { fileId: "file-1", kind: "mindmap", title: "A", absPath: "C:/a.smm" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => null,
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );

    const raw = localStorage.getItem("editorhub-recent-files-v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0]?.id).toBe("path:C:/a.smm");
  });

  it("opens a new file tab after snapshotting the current editor", async () => {
    await openEditorFileTab(
      { fileId: "file-1", kind: "mindmap", title: "A" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => "current",
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );

    expect(snapshot).toHaveBeenCalledWith("tab-switch");
    expect(setHash).toHaveBeenCalledWith("#file=file-1&kind=mindmap");
  });

  it("does not create duplicate tabs for the same file", async () => {
    await openEditorFileTab(
      { fileId: "file-1", kind: "mindmap", title: "A" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => null,
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );
    await openEditorFileTab(
      { fileId: "file-1", kind: "mindmap", title: "A2" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => null,
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );

    const state = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(
      state.tabs.filter((tab: { id: string }) => tab.id === "file:file-1"),
    ).toHaveLength(1);
  });

  it("skips reopening when the same file tab is already active", async () => {
    await openEditorFileTab(
      { fileId: "file-1", kind: "mindmap", title: "A" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => null,
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );
    vi.clearAllMocks();

    const ok = await openEditorFileTab(
      { fileId: "file-1", kind: "mindmap", title: "A" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => "file-1",
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );

    expect(ok).toBe(true);
    expect(snapshot).not.toHaveBeenCalled();
    expect(setHash).not.toHaveBeenCalled();
  });

  it("does not change hash when snapshot fails", async () => {
    snapshot.mockResolvedValueOnce({ ok: false, reason: "blocked" });

    await openEditorFileTab(
      { fileId: "file-2", kind: "excalidraw", title: "B" },
      {
        snapshot,
        setHash,
        getCurrentFileId: () => "current",
        buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      },
    );

    expect(setHash).not.toHaveBeenCalled();
  });

  it("closing the last active file tab prepares close and returns home", async () => {
    const state = openFileTab(createInitialEditorTabsState(), {
      fileId: "file-1",
      kind: "mindmap",
      title: "A",
    });
    writeEditorTabsState(state);

    await closeEditorTabWithSnapshot(fileTabId("file-1"), {
      snapshot,
      setHash,
      getCurrentFileId: () => "file-1",
      buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      buildHomeHash: () => "#view=home",
    });

    expect(prepareEditorTabForClose).toHaveBeenCalledWith(
      "file-1",
      "tab-close",
      "exit",
    );
    expect(setHash).toHaveBeenCalledWith("#view=home");
  });

  it("closing a background file tab while on home still prepares that tab", async () => {
    const state = openFileTab(createInitialEditorTabsState(), {
      fileId: "bg-file",
      kind: "mindmap",
      title: "Bg",
    });
    writeEditorTabsState({ ...state, activeTabId: HOME_TAB_ID });

    await closeEditorTabWithSnapshot(fileTabId("bg-file"), {
      snapshot,
      setHash,
      getCurrentFileId: () => null,
      buildHomeHash: () => "#view=home",
    });

    expect(prepareEditorTabForClose).toHaveBeenCalledWith(
      "bg-file",
      "tab-close",
      "exit",
    );
    expect(snapshot).not.toHaveBeenCalled();
    expect(setHash).not.toHaveBeenCalled();
  });

  it("closes the tab after prepare when the tab id changed during save", async () => {
    let state = openFileTab(createInitialEditorTabsState(), {
      fileId: "local-draft:draft-1",
      kind: "mindmap",
      title: "Draft",
    });
    writeEditorTabsState({ ...state, activeTabId: HOME_TAB_ID });
    const originalTabId = fileTabId("local-draft:draft-1");

    prepareEditorTabForClose.mockImplementation(async (fileId) => {
      writeEditorTabsState(
        replaceFileTab(readEditorTabsState(), {
          fromFileId: fileId,
          toFileId: "server-file-1",
          kind: "mindmap",
          title: "Saved",
        }),
      );
      return true;
    });

    await closeEditorTabWithSnapshot(originalTabId, {
      snapshot,
      setHash,
      getCurrentFileId: () => null,
      buildHomeHash: () => "#view=home",
    });

    const next = readEditorTabsState();
    expect(next.tabs.some((tab) => tab.type === "file")).toBe(false);
    expect(prepareEditorTabForClose).toHaveBeenCalledWith(
      "local-draft:draft-1",
      "tab-close",
      "exit",
    );
  });

  it("activating an existing file tab snapshots then switches hash", async () => {
    let state = openFileTab(createInitialEditorTabsState(), {
      fileId: "a",
      kind: "mindmap",
      title: "A",
    });
    state = openFileTab(state, {
      fileId: "b",
      kind: "excalidraw",
      title: "B",
    });
    writeEditorTabsState(state);

    await activateEditorTab(fileTabId("a"), {
      snapshot,
      setHash,
      getCurrentFileId: () => "b",
      buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      buildHomeHash: () => "#view=home",
    });

    expect(snapshot).toHaveBeenCalledWith("tab-switch");
    expect(setHash).toHaveBeenCalledWith("#file=a&kind=mindmap");
  });

  it("replaces an open local draft tab after formal save", () => {
    const state = openFileTab(createInitialEditorTabsState(), {
      fileId: "local-draft:1",
      kind: "mindmap",
      title: "Draft",
    });
    writeEditorTabsState(state);

    replaceOpenFileTabAfterSave({
      fromFileId: "local-draft:1",
      toFileId: "server-1",
      kind: "mindmap",
      title: "Saved",
    });

    const next = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(next.activeTabId).toBe("file:server-1");
    expect(next.tabs.map((tab: { id: string }) => tab.id)).toEqual([
      "home",
      "file:server-1",
    ]);
  });

  it("removes a missing active file tab and returns home without snapshotting", () => {
    let state = openFileTab(createInitialEditorTabsState(), {
      fileId: "missing-file",
      kind: "mindmap",
      title: "Missing",
    });
    state = openFileTab(state, {
      fileId: "other-file",
      kind: "excalidraw",
      title: "Other",
    });
    state = openFileTab(state, {
      fileId: "missing-file",
      kind: "mindmap",
      title: "Missing",
    });
    writeEditorTabsState(state);

    removeMissingEditorFileTab("missing-file", {
      setHash,
      buildHomeHash: () => "#view=home",
    });

    const next = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(snapshot).not.toHaveBeenCalled();
    expect(setHash).toHaveBeenCalledWith("#view=home");
    expect(next.activeTabId).toBe("home");
    expect(next.tabs.map((tab: { id: string }) => tab.id)).toEqual([
      "home",
      "file:other-file",
    ]);
  });

  it("reconciles direct file and home hash navigation into tab state", () => {
    reconcileEditorTabsWithHash("#file=direct-file&kind=mindmap", {
      resolveFileTitle: async () => null,
    });
    let next = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(next.activeTabId).toBe("file:direct-file");
    expect(next.tabs.map((tab: { id: string }) => tab.id)).toEqual([
      "home",
      "file:direct-file",
    ]);

    const before = sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY);
    reconcileEditorTabsWithHash("#file=direct-file&kind=mindmap", {
      resolveFileTitle: async () => null,
    });
    expect(sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY)).toBe(before);

    reconcileEditorTabsWithHash("#view=files", {
      resolveFileTitle: async () => null,
    });
    next = JSON.parse(sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}");
    expect(next.activeTabId).toBe("home");
    expect(next.tabs.map((tab: { id: string }) => tab.id)).toEqual([
      "home",
      "file:direct-file",
    ]);
  });

  it("refreshes an open tab title from the authoritative file name", async () => {
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-1",
        kind: "mindmap",
        title: "未命名",
      }),
    );

    await refreshOpenFileTabTitle("file-1", {
      resolveFileTitle: async () => "真实标题",
    });

    const next = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(next.tabs.find((tab: { id: string }) => tab.id === "file:file-1"))
      .toMatchObject({
        title: "真实标题",
      });
  });

  it("renames an open file tab in place when the file is renamed", () => {
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-1",
        kind: "mindmap",
        title: "旧名字",
      }),
    );

    renameOpenFileTab("file-1", "  新名字  ");

    const next = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(
      next.tabs.find((tab: { id: string }) => tab.id === "file:file-1"),
    ).toMatchObject({ title: "新名字" });
  });

  it("ignores a blank rename so the tab keeps its title", () => {
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-1",
        kind: "mindmap",
        title: "保留名字",
      }),
    );

    renameOpenFileTab("file-1", "   ");

    const next = JSON.parse(
      sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY) ?? "{}",
    );
    expect(
      next.tabs.find((tab: { id: string }) => tab.id === "file:file-1"),
    ).toMatchObject({ title: "保留名字" });
  });

  it("restoreDesktopEditorSession navigates to last active file tab on cold start", () => {
    vi.spyOn(runtimePlatform, "isDesktopEditorHub").mockReturnValue(true);
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-abc",
        kind: "excalidraw",
        title: "Diagram",
      }),
    );

    const restored = restoreDesktopEditorSession({
      setHash,
      buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      buildHomeHash: () => "#home",
    });

    expect(restored).toBe(true);
    expect(window.location.hash).toBe("#file=file-abc&kind=excalidraw");
    expect(setHash).not.toHaveBeenCalled();
  });

  it("restoreDesktopEditorSession skips when hash already points at an editor", () => {
    vi.spyOn(runtimePlatform, "isDesktopEditorHub").mockReturnValue(true);
    writeEditorTabsState(
      openFileTab(createInitialEditorTabsState(), {
        fileId: "file-abc",
        kind: "excalidraw",
        title: "Diagram",
      }),
    );

    Object.defineProperty(window, "location", {
      value: { hash: "#file=other&kind=mindmap" },
      writable: true,
      configurable: true,
    });

    const skipped = restoreDesktopEditorSession({
      setHash,
      buildFileHash: (fileId, kind) => `#file=${fileId}&kind=${kind}`,
      buildHomeHash: () => "#home",
    });

    expect(skipped).toBe(false);
    expect(setHash).not.toHaveBeenCalled();
  });
});
