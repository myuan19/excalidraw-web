import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

describe("Desktop title bar source contract", () => {
  it("uses a frameless Electron window with custom control IPC", () => {
    const mainSource = fs.readFileSync(
      path.join(appRoot, "../desktop/electron/main.mjs"),
      "utf8",
    );
    const preloadSource = fs.readFileSync(
      path.join(appRoot, "../desktop/electron/preload.mjs"),
      "utf8",
    );

    expect(mainSource).toContain("frame: false");
    expect(mainSource).toContain("loadDesktopWindowIcon");
    expect(mainSource).toContain("drawing-space.svg");
    expect(mainSource).toContain('ipcMain.handle("desktop:windowMinimize"');
    expect(mainSource).toContain('ipcMain.handle("desktop:windowToggleMaximize"');
    expect(mainSource).toContain('ipcMain.handle("desktop:windowClose"');
    expect(mainSource).toContain('ipcMain.handle("desktop:requestWindowClose"');
    expect(mainSource).toContain('ipcMain.handle("desktop:finishWindowClose"');
    expect(mainSource).toContain("desktop:windowCloseRequested");
    expect(preloadSource).toContain("windowMinimize");
    expect(preloadSource).toContain("windowToggleMaximize");
    expect(preloadSource).toContain("windowClose");
    expect(preloadSource).toContain("requestWindowClose");
    expect(preloadSource).toContain("finishWindowClose");
    expect(preloadSource).toContain("onWindowCloseRequested");
  });

  it("mounts the custom title bar only in the desktop shell", () => {
    const appSource = fs.readFileSync(path.join(appRoot, "App.tsx"), "utf8");
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );
    const titleBarStyleSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.scss"),
      "utf8",
    );

    expect(appSource).toContain("DesktopTitleBar");
    expect(appSource).toContain("app-shell--desktop");
    expect(titleBarSource).toContain("MAIN_SITE_ICON");
    expect(titleBarSource).toContain("windowMinimize");
    expect(titleBarStyleSource).toContain("-webkit-app-region: drag");
    expect(titleBarStyleSource).toContain(
      ".app-shell--desktop .filelist__sidebar-brand",
    );
  });

  it("keeps empty titlebar space draggable while file tabs remain interactive", () => {
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );
    const titleBarStyleSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.scss"),
      "utf8",
    );
    const tabsWrapperBlock = titleBarStyleSource.slice(
      titleBarStyleSource.indexOf(".titlebar-tabs__wrapper"),
      titleBarStyleSource.indexOf(".titlebar-tabs {"),
    );

    expect(tabsWrapperBlock).not.toContain("-webkit-app-region: no-drag");
    expect(titleBarStyleSource).toContain(".titlebar-tabs__tab {");
    expect(titleBarStyleSource).toContain("-webkit-app-region: no-drag");
    expect(titleBarSource).toContain("onPointerDown");
    expect(titleBarSource).toContain("reorderOpenFileTab");
    expect(titleBarSource).toContain("!session.moved");
    expect(titleBarSource).toContain("activateEditorTab(session.sourceTabId)");
    expect(titleBarSource).not.toContain("dataTransfer");
    expect(titleBarSource).not.toContain("onDragStart");
    expect(titleBarSource).not.toContain("onDrop");
  });

  it("reorders tabs by sliding siblings without reordering the DOM mid-drag", () => {
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );
    const titleBarStyleSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.scss"),
      "utf8",
    );

    // The dragged tab follows the pointer while siblings translate to open a
    // gap; the committed order is derived once on pointer up. Reordering the
    // rendered array mid-drag is what made the tab jump off the cursor.
    expect(titleBarSource).toContain("dragTargetIndex");
    expect(titleBarSource).toContain("computeTabShift");
    expect(titleBarSource).toContain("--titlebar-tab-shift-x");
    expect(titleBarSource).toContain("state.tabs.map");
    expect(titleBarSource).not.toContain("dragVisualOrder");
    expect(titleBarStyleSource).toContain(".titlebar-tabs__tab--shifting");
  });

  it("keeps tab drag smooth by batching pointer movement and disabling window drag while dragging", () => {
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );
    const titleBarStyleSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.scss"),
      "utf8",
    );

    expect(titleBarSource).toContain("pendingDragOffsetRef");
    expect(titleBarSource).toContain("dragOffsetFrameRef");
    expect(titleBarSource).toContain("window.requestAnimationFrame");
    expect(titleBarSource).toContain("scheduleDragOffset(delta)");
    expect(titleBarSource).not.toContain("setDragOffset(delta);");
    expect(titleBarSource).toContain("titlebar-tabs__wrapper--dragging");
    expect(titleBarStyleSource).toContain(".titlebar-tabs__wrapper--dragging");
    expect(titleBarStyleSource).toContain("-webkit-app-region: no-drag;");
  });

  it("has layout diagnostics for tab strip width changes via devDebug app channel", () => {
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );

    expect(titleBarSource).toContain("isTitlebarTabsLayoutDebugEnabled");
    expect(titleBarSource).toContain("shell-tab-strip");
    expect(titleBarSource).toContain("titlebar-tabs__tab--home");
    expect(titleBarSource).toContain("shell-tab-strip__arrow--visible");
    expect(titleBarSource).toContain("collectInlineTabsLayoutDebug");
    expect(titleBarSource).toContain("debugInlineTabsLayout");
    expect(titleBarSource).toContain("tabs overflow changed");
    expect(titleBarSource).toContain("tabs layout next frame");
  });

  it("syncs the tab title when a file is renamed", () => {
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );

    expect(titleBarSource).toContain('"excalidraw-file-renamed"');
    expect(titleBarSource).toContain("renameOpenFileTab");
  });

  it("renders unsaved tabs with inline dot only, no outer amber ring", () => {
    const titleBarSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.tsx"),
      "utf8",
    );
    const titleBarStyleSource = fs.readFileSync(
      path.join(appRoot, "components/DesktopTitleBar.scss"),
      "utf8",
    );
    const unsavedTabBlock = titleBarStyleSource.slice(
      titleBarStyleSource.indexOf(".titlebar-tabs__tab--unsaved {"),
      titleBarStyleSource.indexOf(".titlebar-tabs__tab--unsaved .titlebar-tabs__close"),
    );

    expect(titleBarSource).toContain("titlebar-tabs__dot");
    expect(titleBarSource).not.toContain("titlebar-tabs__status-dot");
    expect(titleBarStyleSource).toContain(".titlebar-tabs__dot");
    expect(unsavedTabBlock).not.toContain("color-mix");
    expect(unsavedTabBlock).not.toContain("45%");
  });
});
