import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("editor sync architecture source contract", () => {
  it("routes version recovery through ensureSessionVersionAfterCacheOpen only", () => {
    const versionSync = read("data/documentSessionVersionSync.ts");
    const loadFile = read("data/loadEditorServerFile.ts");
    const serverSync = read("data/ServerSync.ts");
    const excalidrawInit = read("editors/excalidraw/initializeExcalidrawScene.ts");

    expect(loadFile).toContain("ensureSessionVersionAfterCacheOpen");
    expect(serverSync).toContain("ensureSessionVersionAfterCacheOpen");
    expect(excalidrawInit).toContain("ensureSessionVersionAfterCacheOpen");

    expect(serverSync).not.toContain("reconcileSessionVersionFromHashList");
    expect(serverSync).not.toContain("supplementSessionVersionIfMissing");
    expect(loadFile).not.toContain("supplementSessionVersionIfMissing");
    expect(excalidrawInit).not.toContain("supplementSessionVersionIfMissing");
    expect(versionSync).toContain("applySessionVersionFromHashEntry");
  });

  it("keeps conflict dialog copy centralized on editorSyncSurface", () => {
    const leaveConfirm = read("shell/editorLeaveConfirm.ts");
    const saveConflict = read("shell/editorSaveConflict.ts");
    const remoteRefresh = read("hooks/useRemoteFileRefresh.ts");
    const syncSurface = read("data/editorSyncSurface.ts");

    expect(leaveConfirm).toContain("buildServerUpdateConfirmCopy");
    expect(saveConflict).toContain("promptServerUpdateConfirm");
    expect(remoteRefresh).toContain("promptServerUpdateConfirm");
    expect(syncSurface).toContain("local-folder");
    expect(syncSurface).toContain("磁盘文件已更改");
    expect(leaveConfirm).not.toMatch(/isDesktopEditorHub\(/);
  });

  it("separates cross-tab refresh policy from save conflict handling", () => {
    const refreshPolicy = read("data/remoteFileRefreshPolicy.ts");
    const saveConflict = read("shell/editorSaveConflict.ts");
    const serverSync = read("data/ServerSync.ts");

    expect(refreshPolicy).toContain("decideRemoteFileRefresh");
    expect(saveConflict).toContain("isServerSyncVersionConflictError");
    expect(serverSync).toContain('body?.error === "version_conflict"');
    expect(refreshPolicy).not.toContain("promptServerUpdateConfirm");
    expect(saveConflict).not.toContain("BroadcastChannel");
  });

  it("does not reintroduce dead mindmap open sync policy", () => {
    const mindmapDir = path.join(appRoot, "editors/mindmap");
    const files = fs.readdirSync(mindmapDir);
    expect(files).not.toContain("mindMapOpenSyncPolicy.ts");
    expect(read("data/mindMapOpenState.ts")).toContain(
      "shouldFetchServerAfterCachedOpen",
    );
  });
});
