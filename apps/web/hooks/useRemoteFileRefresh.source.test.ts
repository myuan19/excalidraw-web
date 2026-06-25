import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function read(relPath: string): string {
  return fs.readFileSync(path.join(webRoot, relPath), "utf8");
}

describe("useRemoteFileRefresh source contract", () => {
  it("queues concurrent targets and drains after reload", () => {
    const source = read("hooks/useRemoteFileRefresh.ts");
    expect(source).toContain("queueRemoteUpdateTarget");
    expect(source).toContain("consumeQueuedRemoteUpdateTarget");
    expect(source).toContain("processRemoteTarget");
    expect(source).toContain("promptInFlightRef");
    expect(source).toContain("reloadInFlightRef");
  });

  it("wires editors through target-aware reload handlers", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");

    expect(excalidrawShell).toContain("getDocumentName:");
    expect(excalidrawShell).toContain("RemoteUpdateTarget");
    expect(mindMapShell).toContain("reloadFromCrossTabSave");
    expect(mindMapShell).toContain("getDocumentName:");
    expect(mindMapShell).toContain("isRemoteUpdateTargetSatisfied");
  });
});

describe("editor leave flow source contract", () => {
  it("routes discard through the shared leave flow", () => {
    const leaveFlow = read("shell/editorLeaveFlow.ts");
    const bridge = read("data/activeEditorSaveBridge.ts");
    const leaveConfirm = read("shell/editorLeaveConfirm.ts");

    expect(leaveFlow).toContain("requestEditorTabDiscard");
    expect(leaveFlow).toContain("discardLocalDraftSession");
    expect(bridge).toContain("registerEditorTabDiscardHandler");
    expect(leaveConfirm).toContain("不保存，放弃修改并返回");
    expect(leaveConfirm).toContain("尚未保存到本地文件夹，是否保存？");
    expect(leaveConfirm).toContain("有未保存的修改，是否保存？");
    expect(leaveConfirm).not.toContain("是否先保存");
  });
});
