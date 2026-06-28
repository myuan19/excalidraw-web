import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EditorPaneStack source contract", () => {
  it("owns pane rendering with z-index stack independent of tab strip", () => {
    const stackSource = fs.readFileSync(
      path.join(__dirname, "EditorPaneStack.tsx"),
      "utf8",
    );
    const scss = fs.readFileSync(
      path.join(__dirname, "EditorPaneStack.scss"),
      "utf8",
    );
    const hostSource = fs.readFileSync(
      path.join(__dirname, "EditorTabCacheHost.tsx"),
      "utf8",
    );

    expect(stackSource).toContain("listFileEditorTabsForPaneStack");
    expect(stackSource).toContain("isPaneForeground");
    expect(stackSource).toContain("editor-pane-stack__pane--foreground");
    expect(scss).toContain(".editor-pane-stack__pane");
    expect(scss).toContain("z-index");
    expect(hostSource).toContain("<EditorPaneStack");
    expect(hostSource).not.toContain("CachedFileEditorPane");
  });

  it("keeps dirty background panes running without coupling to tab drag reorder", () => {
    const stackSource = fs.readFileSync(
      path.join(__dirname, "EditorPaneStack.tsx"),
      "utf8",
    );
    const runStateSource = fs.readFileSync(
      path.join(__dirname, "editorPaneRunState.ts"),
      "utf8",
    );
    const scss = fs.readFileSync(
      path.join(__dirname, "EditorPaneStack.scss"),
      "utf8",
    );

    expect(stackSource).toContain("subscribeEditorPaneRunState");
    expect(stackSource).toContain("shouldKeepEditorPaneRunningInBackground");
    expect(stackSource).not.toContain("isEditorTabActive");
    expect(stackSource).not.toContain("FileSyncState");
    expect(stackSource).not.toContain("isTabFileDirty");
    expect(runStateSource).toContain("excalidraw-file-sync-state");
    expect(runStateSource).toContain("FileSyncState.hasUnsavedChanges");
    expect(runStateSource).toContain("isTabFileDirty");
    expect(stackSource).toContain("editor-pane-stack__pane--keep-running");
    expect(stackSource).not.toContain("reorderOpenFileTab");
    expect(scss).toContain(
      ".editor-pane-stack__pane--background.editor-pane-stack__pane--keep-running",
    );
    expect(scss).toContain(
      ".editor-pane-stack__pane--background.editor-pane-stack__pane--save-active",
    );
    expect(scss).toContain("visibility: visible");
    expect(scss).not.toMatch(/save-active[\s\S]*z-index:\s*2/);
  });
});
