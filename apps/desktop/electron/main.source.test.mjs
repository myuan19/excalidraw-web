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
    expect(source).toContain('ipcMain.handle("desktop:getAppDataDirectoryPath"');
    expect(source).toContain("frame: false");
    expect(source).toContain('ipcMain.handle("desktop:windowMinimize"');
    expect(source).toContain('ipcMain.handle("desktop:windowToggleMaximize"');
    expect(source).toContain('ipcMain.handle("desktop:windowClose"');
    expect(source).toContain('ipcMain.handle("desktop:requestWindowClose"');
    expect(source).toContain('ipcMain.handle("desktop:finishWindowClose"');
    expect(source).toContain("window-close-force");
    expect(source).toContain("windowCloseAwaitingRenderer");
    expect(source).not.toContain("window-close-reply-timeout");
    expect(source).toContain("desktop:windowCloseRequested");
    expect(source).toContain("desktopPaths");
    expect(source).not.toContain("function resolveCatalogRoot()");
    expect(source).toContain("loadDesktopWindowIcon");
    expect(source).toContain("maskable_icon_x512.png");
    expect(source).not.toContain("drawing-space.svg");
    expect(source).not.toContain("public/favicon.svg");
    expect(source).toContain("desktop:consumeOpenDocumentPaths");
    expect(source).toContain("rendererOpenDocumentsReady");
    expect(source).toContain("requestSingleInstanceLock");
  });

  it("uses editorhub protocol and IPC instead of fixed localhost port", () => {
    const source = fs.readFileSync(mainPath, "utf8");

    expect(source).toContain("createDesktopBackend");
    expect(source).toContain("attachCatalogIpcBridge");
    expect(source).toContain("registerEditorHubProtocol");
    expect(source).toContain("EDITORHUB_APP_INDEX_URL");
    expect(source).toContain("ensureMainWindowShell");
    expect(source).toContain("window-early-show");
    expect(source).toContain('ipcMain.handle("editorhub:api"');
    expect(source).toContain("parseEditorHubDeepLinkFromArgv");
    expect(source).toContain("queueDeepLinkNavigation");
    expect(source).toContain('app.setAsDefaultProtocolClient("editorhub")');
    expect(source).not.toContain("loadURL(\"http://127.0.0.1:3033");
  });

  it("registers editorhub protocol scheme for packaged installs", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
    );
    expect(pkg.build.protocols).toEqual([
      { name: "EditorHub", schemes: ["editorhub"] },
    ]);
  });

  it("registers document file associations for packaged default-open support", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
    );
    const extensions = pkg.build.fileAssociations.map((item) => item.ext);

    expect(extensions).toEqual(["excalidraw", "smm", "excalidrawlib"]);
    expect(pkg.build.fileAssociations.every((item) => item.role === "Editor")).toBe(
      true,
    );
    expect(pkg.build.icon).toBe("build/icon.ico");
    expect(pkg.build.win.icon).toBe("build/icon.ico");
    expect(pkg.build.win.signExecutable).toBe(false);
    expect(pkg.build.win.signAndEditExecutable).toBeUndefined();
  });
});
