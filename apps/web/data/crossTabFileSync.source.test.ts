import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("cross-tab file sync source contract", () => {
  it("keeps BroadcastChannel plumbing isolated from auto-save policy", () => {
    const crossTabSource = read("data/crossTabFileSync.ts");
    const autoSaveSource = read("data/autoSaveSession.ts");
    const serverSyncSource = read("data/ServerSync.ts");
    const fileListSource = read("hooks/useFileListController.tsx");

    expect(crossTabSource).toContain("new BroadcastChannel(CHANNEL_NAME)");
    expect(crossTabSource).toContain("broadcastFileSaved");
    expect(crossTabSource).toContain("onCrossTabFileSaved");
    expect(autoSaveSource).not.toContain("new BroadcastChannel");
    expect(serverSyncSource).toContain('from "./crossTabFileSync"');
    expect(serverSyncSource).toContain("broadcastFileSaved(id");
    expect(fileListSource).toContain('from "../data/crossTabFileSync"');
  });

  it("active editors subscribe to cross-tab saves through the shared hook", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");
    const remoteRefreshHook = read("hooks/useRemoteFileRefresh.ts");
    const serverSyncSource = read("data/ServerSync.ts");

    expect(remoteRefreshHook).toContain("onCrossTabFileSaved");
    expect(remoteRefreshHook).toContain("decideRemoteFileRefresh");
    expect(remoteRefreshHook).toContain("isTabFileDirty");
    expect(remoteRefreshHook).toContain("promptServerUpdateConfirm");
    expect(remoteRefreshHook).toContain("beginRemoteUpdatePrompt");
    expect(excalidrawShell).toContain("useRemoteFileRefresh");
    expect(excalidrawShell).not.toContain("RemoteUpdateConfirmDialog");
    expect(excalidrawShell).toContain(
      "loadEditorServerFile(fileId, { force: true })",
    );
    expect(mindMapShell).toContain("useRemoteFileRefresh");
    expect(mindMapShell).not.toContain("RemoteUpdateConfirmDialog");
    expect(mindMapShell).toContain(
      "loadEditorServerFile(fileId, { force: true })",
    );
    // 跨标签 file-saved 决策已收敛进 useRemoteFileRefresh，shell 只需订阅该 hook。
    expect(remoteRefreshHook).toContain("cross-tab file-saved decision");
    expect(serverSyncSource).toContain("opts?: { force?: boolean }");
    expect(serverSyncSource).toContain("priorHash && !force");
    // 强制刷新改为「force 查询 nonce + no-cache 头」绕过缓存，替代旧的 fetch cache 选项。
    expect(serverSyncSource).toContain("?force=${forceNonce()}");
    expect(serverSyncSource).toContain('"Cache-Control": "no-cache"');
  });
});
