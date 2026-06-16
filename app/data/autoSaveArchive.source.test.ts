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
    expect(filesRouteSource).toContain("matchingArchive");
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

  it("restore confirm relies on server archive coverage instead of local dirty state", () => {
    const restoreConfirmSource = fs.readFileSync(
      path.join(appRoot, "data/checkpointRestoreConfirm.ts"),
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

    expect(restoreConfirmSource).toContain("fetchCheckpointCoverage");
    expect(restoreConfirmSource).not.toContain("hasLocalChanges");
    expect(excalidrawSaveSource).not.toMatch(
      /confirmBeforeRestoreCheckpoint\([\s\S]*hasLocalChanges/,
    );
    expect(mindMapSaveSource).not.toMatch(
      /confirmBeforeRestoreCheckpoint\([\s\S]*hasLocalChanges/,
    );
  });

  it("stores archive thumbnails separately from latest thumbnails", () => {
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../server/routes/files.js"),
      "utf8",
    );
    const serverSyncSource = fs.readFileSync(
      path.join(appRoot, "data/ServerSync.ts"),
      "utf8",
    );
    const archivePreviewSource = fs.readFileSync(
      path.join(appRoot, "data/thumbnailService.ts"),
      "utf8",
    );
    const checkpointOrchestratorSource = fs.readFileSync(
      path.join(appRoot, "data/checkpointSaveOrchestrator.ts"),
      "utf8",
    );
    const documentThumbnailSource = fs.readFileSync(
      path.join(appRoot, "data/documentThumbnail.ts"),
      "utf8",
    );
    const archiveThumbPersistenceSource = fs.readFileSync(
      path.join(appRoot, "data/archiveThumbnailPersistence.ts"),
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

    expect(filesRouteSource).toContain("archiveThumbnailPath");
    expect(filesRouteSource).toContain(
      'router.get("/:id/archives/:archiveId/thumbnail"',
    );
    expect(filesRouteSource).toContain(
      'router.put("/:id/archives/:archiveId/thumbnail"',
    );
    expect(filesRouteSource).toContain("has_thumbnail");
    expect(serverSyncSource).toContain("getArchiveThumbnail");
    expect(serverSyncSource).toContain("putArchiveThumbnail");
    expect(archivePreviewSource).toContain("resolveArchivePreview");
    expect(archivePreviewSource).toContain("buildDocumentThumbnailSvg");
    expect(archivePreviewSource).toContain("ServerSync.getArchiveThumbnail");
    expect(archivePreviewSource).toContain("uploadArchiveThumbnail");
    expect(checkpointOrchestratorSource).toContain("executeCheckpointSave");
    expect(documentThumbnailSource).toContain("buildSceneThumbnailSvg");
    expect(documentThumbnailSource).not.toContain("buildMindMapThumbnailSvg");
    expect(archivePreviewSource).toContain("buildNativeMindMapThumbnailSvg");
    expect(archiveThumbPersistenceSource).toContain(
      "persistArchiveThumbnailIfAvailable",
    );
    expect(excalidrawSaveSource).toContain("executeCheckpointSave");
    expect(mindMapSaveSource).toContain("executeCheckpointSave");
  });
});
