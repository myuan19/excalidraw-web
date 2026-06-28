/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  beginMindMapNativeSavePaneBoost,
  mindMapNativeSavePaneBoostClasses,
} from "./mindMapNativeSavePaneBoost";

describe("mindMapNativeSavePaneBoost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reveals cached pane ancestors while background save runs", () => {
    document.body.innerHTML = `
      <div class="editor-tab-cache-pane editor-tab-cache-pane--cached">
        <div class="editor-platform-shell">
          <div class="mindmap-editor"></div>
        </div>
      </div>
    `;
    const shell = document.querySelector(".mindmap-editor") as HTMLDivElement;
    const cachePane = document.querySelector(
      ".editor-tab-cache-pane--cached",
    ) as HTMLDivElement;
    const platformShell = document.querySelector(
      ".editor-platform-shell",
    ) as HTMLDivElement;

    const release = beginMindMapNativeSavePaneBoost(shell, false);

    expect(cachePane.classList.contains(
      mindMapNativeSavePaneBoostClasses.cachePane,
    )).toBe(true);
    expect(platformShell.classList.contains(
      mindMapNativeSavePaneBoostClasses.platformShell,
    )).toBe(true);

    release();

    expect(cachePane.classList.contains(
      mindMapNativeSavePaneBoostClasses.cachePane,
    )).toBe(false);
    expect(platformShell.classList.contains(
      mindMapNativeSavePaneBoostClasses.platformShell,
    )).toBe(false);
  });

  it("does not boost when pane is already foreground", () => {
    document.body.innerHTML = `<div class="mindmap-editor"></div>`;
    const shell = document.querySelector(".mindmap-editor") as HTMLDivElement;
    const release = beginMindMapNativeSavePaneBoost(shell, true);
    expect(release).toBeTypeOf("function");
    release();
  });
});
