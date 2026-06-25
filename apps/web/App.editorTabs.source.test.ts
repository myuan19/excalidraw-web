import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, "App.tsx");

describe("App editor tabs source contract", () => {
  it("renders tabs via DesktopTitleBar and routes navigation through the tab service", () => {
    const source = fs.readFileSync(appPath, "utf8");

    expect(source).toContain("DesktopTitleBar");
    expect(source).toContain("<DesktopTitleBar");
    expect(source).toContain("openEditorFileTab");
    expect(source).toContain("reconcileEditorTabsWithHash");
    expect(source).toContain('window.addEventListener("hashchange", h)');
    expect(source).not.toContain("window.location.hash = next;");
  });

  it("uses EditorTabCacheHost on desktop for keep-alive tab switching", () => {
    const source = fs.readFileSync(appPath, "utf8");

    expect(source).toContain("EditorTabCacheHost");
    expect(source).toContain("isDesktopEditorHub()");
  });

  it("keeps cached editor panes laid out for iframe-backed editors", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "shell/EditorTabCacheHost.scss"),
      "utf8",
    );

    const cachedPaneBlock = source.slice(
      source.indexOf(".editor-tab-cache-pane--cached"),
      source.indexOf(".editor-tab-cache-pool"),
    );

    expect(cachedPaneBlock).toContain("visibility: hidden");
    expect(cachedPaneBlock).toContain("pointer-events: none");
    expect(cachedPaneBlock).not.toContain("content-visibility");
    expect(cachedPaneBlock).not.toContain("contain:");
  });

  it("logs active-pane gaps instead of silently rendering a blank editor area", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "shell/EditorTabCacheHost.tsx"),
      "utf8",
    );

    expect(source).toContain("activeFileTab");
    expect(source).toContain("active tab has no pane");
    expect(source).toContain("missing editor definition");
    expect(source).toContain("missing lazy editor");
  });

  it("inline tabs are rendered inside DesktopTitleBar, not as a standalone component", () => {
    const titleBarSource = fs.readFileSync(
      path.join(__dirname, "components/DesktopTitleBar.tsx"),
      "utf8",
    );

    expect(titleBarSource).toContain("InlineTabs");
    expect(titleBarSource).toContain("activateEditorTab");
    expect(titleBarSource).toContain("closeEditorTabWithSnapshot");
    expect(titleBarSource).toContain("readEditorTabsState");
    expect(titleBarSource).toContain("titlebar-tabs");
  });
});
