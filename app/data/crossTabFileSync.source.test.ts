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
    const saveQueueSource = read("data/saveQueue.ts");
    const fileListSource = read("hooks/useFileListController.tsx");

    expect(crossTabSource).toContain("new BroadcastChannel(CHANNEL_NAME)");
    expect(crossTabSource).toContain("broadcastFileSaved");
    expect(crossTabSource).toContain("onCrossTabFileSaved");
    expect(autoSaveSource).not.toContain("new BroadcastChannel");
    expect(saveQueueSource).toContain('from "./crossTabFileSync"');
    expect(fileListSource).toContain('from "../data/crossTabFileSync"');
  });

  it("active editors subscribe to cross-tab saves through the shared hook", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");
    const platformShell = read("components/EditorPlatformSidebar.tsx");
    const remoteRefreshHook = read("hooks/useRemoteFileRefresh.ts");
    const serverSyncSource = read("data/ServerSync.ts");
    const saveQueueSource = read("data/saveQueue.ts");

    expect(remoteRefreshHook).toContain("onCrossTabFileSaved");
    expect(remoteRefreshHook).toContain("decideRemoteFileRefresh");
    expect(remoteRefreshHook).toContain("isTabFileDirty");
    expect(remoteRefreshHook).toContain("promptServerUpdateConfirm");
    expect(excalidrawShell).toContain("useRemoteFileRefresh");
    expect(excalidrawShell).not.toContain("RemoteUpdateConfirmDialog");
    expect(platformShell).toContain("EditorPlatformDialogHost");
    expect(excalidrawShell).toContain("ServerSync.getFile(fid, { force: true })");
    expect(mindMapShell).toContain("useRemoteFileRefresh");
    expect(mindMapShell).not.toContain("RemoteUpdateConfirmDialog");
    expect(mindMapShell).toContain(
      "ServerSync.getFile(fileId, { force: true })",
    );
    expect(mindMapShell).toContain("cross-tab-file-saved");
    expect(serverSyncSource).toContain("opts?: { force?: boolean }");
    expect(serverSyncSource).toContain("priorHash && !force");
    expect(serverSyncSource).toContain("cache: force ? \"no-store\" : \"default\"");
    expect(serverSyncSource).toContain("getFile force received 304");
    expect(serverSyncSource).toContain("`sync.${event}`");
    expect(serverSyncSource).toContain("get_file.force_304_retry");
    expect(serverSyncSource).toContain("get_file.refetch_304");
    expect(remoteRefreshHook).toContain("`remote.refresh.${event}`");
    expect(remoteRefreshHook).toContain("cross_tab.decision");
    expect(remoteRefreshHook).toContain("prompt.choice");
    expect(saveQueueSource).toContain("`save.queue.${event}`");
    expect(saveQueueSource).toContain("save.start");
    expect(saveQueueSource).toContain("request.queued");
  });
});
