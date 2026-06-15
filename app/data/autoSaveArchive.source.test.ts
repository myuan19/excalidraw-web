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

  it("passes checkpoint policies from both editors to the server save call", () => {
    const excalidrawSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/excalidraw/useForkFileSave.ts"),
      "utf8",
    );
    const mindMapSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/useMindMapFileSave.ts"),
      "utf8",
    );

    for (const source of [excalidrawSaveSource, mindMapSaveSource]) {
      expect(source).toContain("resolveCheckpointPolicy");
      expect(source).toContain(
        "checkpointPolicy: resolveCheckpointPolicy(source)",
      );
    }
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
});
