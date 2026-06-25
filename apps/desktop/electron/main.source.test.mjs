import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(__dirname, "main.mjs");

describe("desktop main source contracts", () => {
  it("opens folder picker at Documents by default", () => {
    const source = fs.readFileSync(mainPath, "utf8");
    const pickFolderBlock = source.slice(
      source.indexOf('ipcMain.handle("desktop:pickFolder"'),
      source.indexOf("void app"),
    );

    expect(pickFolderBlock).toContain('app.getPath("documents")');
    expect(pickFolderBlock).not.toContain("desktop:getWorkspaceSettings");
    expect(pickFolderBlock).not.toContain("desktop:setDefaultWorkspace");
    expect(source).toContain("frame: false");
    expect(source).toContain('ipcMain.handle("desktop:windowMinimize"');
    expect(source).toContain('ipcMain.handle("desktop:windowToggleMaximize"');
    expect(source).toContain('ipcMain.handle("desktop:windowClose"');
    expect(source).toContain('ipcMain.handle("desktop:requestWindowClose"');
    expect(source).toContain('ipcMain.handle("desktop:finishWindowClose"');
    expect(source).toContain("desktop:windowCloseRequested");
    expect(source).toContain("function resolveCatalogRoot()");
    expect(source).toContain("loadDesktopWindowIcon");
    expect(source).toContain("drawing-space.svg");
    expect(source).not.toContain("defaultWorkspacePath");
  });

  it("uses editorhub protocol and IPC instead of fixed localhost port", () => {
    const source = fs.readFileSync(mainPath, "utf8");

    expect(source).toContain("createDesktopBackend");
    expect(source).toContain("attachCatalogIpcBridge");
    expect(source).toContain("registerEditorHubProtocol");
    expect(source).toContain("EDITORHUB_APP_INDEX_URL");
    expect(source).toContain('ipcMain.handle("editorhub:api"');
    expect(source).not.toContain("loadURL(\"http://127.0.0.1:3033");
  });
});
