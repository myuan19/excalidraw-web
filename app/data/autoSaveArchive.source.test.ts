import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

describe("checkpoint archive source contract", () => {
  it("keeps checkpoint classification on the save request instead of post-save patching", () => {
    const checkpointPolicySource = fs.readFileSync(
      path.join(appRoot, "data/checkpointPolicy.ts"),
      "utf8",
    );
    const saveQueueSource = fs.readFileSync(
      path.join(appRoot, "data/saveQueue.ts"),
      "utf8",
    );
    const serverSyncSource = fs.readFileSync(
      path.join(appRoot, "data/ServerSync.ts"),
      "utf8",
    );

    expect(checkpointPolicySource).toContain("resolveCheckpointPolicy");
    expect(checkpointPolicySource).toContain('source === "toolbar"');
    expect(checkpointPolicySource).toContain("checkpointIntervalMin");
    expect(checkpointPolicySource).toContain('source === "visibility"');
    expect(checkpointPolicySource).toContain('source === "thumbnail"');
    expect(checkpointPolicySource).toContain('source === "home"');
    expect(checkpointPolicySource).toContain('mode: "interval"');
    expect(saveQueueSource).not.toContain("manageSessionAutoArchive");
    expect(serverSyncSource).not.toContain("ensureArchiveHeadroomBeforeSave");
    expect(serverSyncSource).toContain(
      "checkpointPolicy: opts?.checkpointPolicy?.mode",
    );
    expect(serverSyncSource).toContain(
      "{ checkpointPolicy: opts.checkpointPolicy }",
    );
  });

  it("routes checkpoint saves through the shared orchestrator", () => {
    const excalidrawSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/excalidraw/useForkFileSave.ts"),
      "utf8",
    );
    const mindMapSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/useMindMapFileSave.ts"),
      "utf8",
    );
    const orchestratorSource = fs.readFileSync(
      path.join(appRoot, "data/checkpointSaveOrchestrator.ts"),
      "utf8",
    );

    for (const source of [excalidrawSaveSource, mindMapSaveSource]) {
      expect(source).toContain("executeCheckpointSave");
    }
    expect(orchestratorSource).toContain("resolveCheckpointPolicy");
  });

  it("creates and trims checkpoint archives inside the backend PUT flow", () => {
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../server/routes/files.js"),
      "utf8",
    );
    const putRouteSource = filesRouteSource.slice(
      filesRouteSource.indexOf('router.put("/:id"'),
      filesRouteSource.indexOf('router.get("/:id/thumbnail"'),
    );

    expect(filesRouteSource).toContain("AUTO_ARCHIVE_LABEL_PREFIX");
    expect(filesRouteSource).toContain("deleteArchivesByLabel(fileId, label)");
    expect(filesRouteSource).toContain("CHECKPOINT_LABELS");
    expect(filesRouteSource).toContain("normalizeCheckpointPolicy");
    expect(filesRouteSource).toContain("maybeAppendCheckpoint");
    expect(filesRouteSource).toContain("findArchiveBySha");
    expect(filesRouteSource).toContain("shouldDedupeCheckpointLabel");
    expect(filesRouteSource).toContain("shouldDedupeCheckpointLabel(label)");
    expect(filesRouteSource).toContain(
      "hasArchiveWithSha(fileId, contentSha256)",
    );
    expect(filesRouteSource).toContain(
      "appendVersionSnapshot(fileId, dataObj, options = {})",
    );
    expect(filesRouteSource).toContain(
      "CASE WHEN label LIKE 'auto:%' THEN 0 ELSE 1 END",
    );
    expect(putRouteSource).toContain(
      "const checkpointPolicy = normalizeCheckpointPolicy",
    );
    expect(putRouteSource).toContain("maybeAppendCheckpoint(");
  });

  it("restore confirm uses hash match and archive panel prompt styling", () => {
    const archivePanelSource = fs.readFileSync(
      path.join(appRoot, "components/ArchivePanel.tsx"),
      "utf8",
    );
    const promptSource = fs.readFileSync(
      path.join(appRoot, "components/ArchivePanelPrompt.tsx"),
      "utf8",
    );
    const modificationSource = fs.readFileSync(
      path.join(appRoot, "data/fileModificationState.ts"),
      "utf8",
    );
    const serverSyncSource = fs.readFileSync(
      path.join(appRoot, "data/ServerSync.ts"),
      "utf8",
    );
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../server/routes/files.js"),
      "utf8",
    );
    const excalidrawSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/excalidraw/useForkFileSave.ts"),
      "utf8",
    );
    const mindMapSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/useMindMapFileSave.ts"),
      "utf8",
    );

    expect(archivePanelSource).toContain("ArchivePanelPrompt");
    expect(archivePanelSource).toContain("evaluateManualArchiveGate");
    expect(archivePanelSource).toContain("readCurrentModificationState");
    expect(archivePanelSource).not.toContain("存档前需要保存，是否继续？");
    expect(promptSource).toContain("AppConfirmDialog");
    expect(promptSource).toContain("app-confirm-dialog-overlay--stacked");
    expect(promptSource).toContain("当前版本没有存档吗？是否需要先存档？");
    expect(promptSource).toContain("若不存档，切换会丢失该版本");
    expect(promptSource).toContain("存档前需要保存，是否继续？");
    expect(promptSource).toContain("当前版本已存在，是否继续存档？");
    expect(promptSource).toContain("确认删除该存档？此操作不可恢复。");
    expect(modificationSource).toContain("evaluateArchiveCoverage");
    expect(modificationSource).toContain("evaluateManualArchiveGate");
    expect(modificationSource).toContain("getServerHash");
    expect(serverSyncSource).not.toContain("getCheckpointStatus");
    expect(filesRouteSource).not.toContain('router.get("/:id/archive-status"');
    expect(modificationSource).toContain("content_sha256");
    expect(excalidrawSaveSource).not.toContain("confirmBeforeRestoreCheckpoint");
    expect(mindMapSaveSource).not.toContain("confirmBeforeRestoreCheckpoint");
  });
});
