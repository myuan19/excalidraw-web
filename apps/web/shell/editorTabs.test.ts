import { describe, expect, it } from "vitest";

import {
  closeEditorTab,
  createInitialEditorTabsState,
  listFileEditorTabsForPaneStack,
  normalizeEditorTabsState,
  openFileTab,
  reorderFileTab,
  replaceFileTab,
  updateFileTabTitle,
  type EditorTabsState,
} from "./editorTabs";

describe("editorTabs state", () => {
  it("starts with a single active home tab", () => {
    const state = createInitialEditorTabsState();

    expect(state.activeTabId).toBe("home");
    expect(state.tabs).toEqual([
      {
        id: "home",
        type: "home",
        title: "首页",
        lastActiveAt: expect.any(String),
      },
    ]);
  });

  it("opens a file tab once and activates the existing tab on repeated open", () => {
    const initial = createInitialEditorTabsState();
    const first = openFileTab(initial, {
      fileId: "file-1",
      kind: "mindmap",
      title: "A",
    });
    const second = openFileTab(first, {
      fileId: "file-1",
      kind: "mindmap",
      title: "A renamed",
    });

    expect(second.activeTabId).toBe("file:file-1");
    expect(second.tabs.filter((tab) => tab.id === "file:file-1")).toHaveLength(
      1,
    );
    expect(second.tabs.find((tab) => tab.id === "file:file-1")).toMatchObject({
      id: "file:file-1",
      type: "file",
      fileId: "file-1",
      kind: "mindmap",
      title: "A renamed",
    });
  });

  it("does not let the placeholder title overwrite an existing real tab title", () => {
    const initial = openFileTab(createInitialEditorTabsState(), {
      fileId: "file-1",
      kind: "mindmap",
      title: "真实文件名",
    });

    const next = openFileTab(initial, {
      fileId: "file-1",
      kind: "mindmap",
      title: "未命名",
    });

    expect(next.tabs.find((tab) => tab.id === "file:file-1")).toMatchObject({
      title: "真实文件名",
    });
  });

  it("closing the last file tab returns to home", () => {
    const state = openFileTab(createInitialEditorTabsState(), {
      fileId: "file-1",
      kind: "excalidraw",
      title: "Sketch",
    });

    const next = closeEditorTab(state, "file:file-1");

    expect(next.activeTabId).toBe("home");
    expect(next.tabs.map((tab) => tab.id)).toEqual(["home"]);
  });

  it("closing the active file tab activates the nearest remaining file tab", () => {
    let state: EditorTabsState = createInitialEditorTabsState();
    state = openFileTab(state, { fileId: "a", kind: "mindmap", title: "A" });
    state = openFileTab(state, { fileId: "b", kind: "mindmap", title: "B" });
    state = openFileTab(state, { fileId: "c", kind: "mindmap", title: "C" });

    const next = closeEditorTab(state, "file:b");

    expect(next.activeTabId).toBe("file:c");
    expect(next.tabs.map((tab) => tab.id)).toEqual([
      "home",
      "file:a",
      "file:c",
    ]);
  });

  it("replaces a local draft file tab with the committed file tab", () => {
    const state = openFileTab(createInitialEditorTabsState(), {
      fileId: "local-draft:1",
      kind: "mindmap",
      title: "Draft",
    });

    const next = replaceFileTab(state, {
      fromFileId: "local-draft:1",
      toFileId: "server-1",
      kind: "mindmap",
      title: "Saved",
    });

    expect(next.activeTabId).toBe("file:server-1");
    expect(next.tabs.map((tab) => tab.id)).toEqual(["home", "file:server-1"]);
    expect(next.tabs[1]).toMatchObject({
      type: "file",
      fileId: "server-1",
      kind: "mindmap",
      title: "Saved",
    });
  });

  it("reorders file tabs while keeping home fixed first", () => {
    let state: EditorTabsState = createInitialEditorTabsState();
    state = openFileTab(state, { fileId: "a", kind: "mindmap", title: "A" });
    state = openFileTab(state, { fileId: "b", kind: "mindmap", title: "B" });
    state = openFileTab(state, { fileId: "c", kind: "mindmap", title: "C" });

    const next = reorderFileTab(state, {
      sourceTabId: "file:a",
      targetTabId: "file:c",
      position: "after",
    });

    expect(next.activeTabId).toBe("file:c");
    expect(next.tabs.map((tab) => tab.id)).toEqual([
      "home",
      "file:b",
      "file:c",
      "file:a",
    ]);
  });

  it("keeps pane stack order stable when the title-bar tab strip is reordered", () => {
    let state: EditorTabsState = createInitialEditorTabsState();
    state = openFileTab(state, { fileId: "a", kind: "mindmap", title: "A" });
    state = openFileTab(state, { fileId: "b", kind: "mindmap", title: "B" });
    state = openFileTab(state, { fileId: "c", kind: "mindmap", title: "C" });

    const stackBefore = listFileEditorTabsForPaneStack(state).map((tab) => tab.id);
    const reordered = reorderFileTab(state, {
      sourceTabId: "file:c",
      targetTabId: "file:a",
      position: "before",
    });

    expect(reordered.tabs.map((tab) => tab.id)).toEqual([
      "home",
      "file:c",
      "file:a",
      "file:b",
    ]);
    expect(listFileEditorTabsForPaneStack(reordered).map((tab) => tab.id)).toEqual(
      stackBefore,
    );
  });

  it("updates an open file tab title from the authoritative file name", () => {
    const state = openFileTab(createInitialEditorTabsState(), {
      fileId: "file-1",
      kind: "mindmap",
      title: "未命名",
    });

    const next = updateFileTabTitle(state, {
      fileId: "file-1",
      title: "真实文件名",
    });

    expect(next.tabs.find((tab) => tab.id === "file:file-1")).toMatchObject({
      type: "file",
      fileId: "file-1",
      title: "真实文件名",
    });
  });

  it("assigns monotonic stackOrder for pane stack independent of strip order", () => {
    let state: EditorTabsState = createInitialEditorTabsState();
    state = openFileTab(state, { fileId: "a", kind: "mindmap", title: "A" });
    state = openFileTab(state, { fileId: "b", kind: "mindmap", title: "B" });

    const tabA = state.tabs.find((tab) => tab.id === "file:a");
    const tabB = state.tabs.find((tab) => tab.id === "file:b");
    expect(tabA?.type === "file" && tabB?.type === "file").toBe(true);
    if (tabA?.type !== "file" || tabB?.type !== "file") {
      return;
    }
    expect(tabB.stackOrder).toBeGreaterThan(tabA.stackOrder);

    const stackBefore = listFileEditorTabsForPaneStack(state).map((tab) => tab.id);
    const reordered = reorderFileTab(state, {
      sourceTabId: "file:b",
      targetTabId: "file:a",
      position: "before",
    });
    expect(listFileEditorTabsForPaneStack(reordered).map((tab) => tab.id)).toEqual(
      stackBefore,
    );
  });

  it("normalizes stale tab kinds to a renderable editor kind", () => {
    const next = normalizeEditorTabsState({
      activeTabId: "file:file-1",
      tabs: [
        {
          id: "home",
          type: "home",
          title: "首页",
          lastActiveAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "file:file-1",
          type: "file",
          fileId: "file-1",
          kind: "unknown-editor",
          title: "Legacy",
          lastActiveAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(next.activeTabId).toBe("file:file-1");
    expect(next.tabs[1]).toMatchObject({
      type: "file",
      fileId: "file-1",
      kind: "excalidraw",
    });
  });
});
