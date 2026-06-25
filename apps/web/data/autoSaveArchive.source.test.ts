import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

describe("checkpoint save source contract", () => {
  it("keeps checkpoint classification on the save request instead of post-save patching", () => {
    const autoSaveSessionSource = fs.readFileSync(
      path.join(appRoot, "data/autoSaveSession.ts"),
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

    expect(autoSaveSessionSource).not.toContain("resolveAutoSaveArchiveLabel");
    expect(autoSaveSessionSource).toContain("isAutoSaveLabel");
    expect(saveQueueSource).not.toContain("manageSessionAutoArchive");
    expect(serverSyncSource).not.toContain("ensureArchiveHeadroomBeforeSave");
    expect(serverSyncSource).toContain("checkpointPolicy: opts?.checkpointPolicy");
    expect(serverSyncSource).toContain("{ checkpointPolicy: opts.checkpointPolicy }");
  });

  it("passes checkpoint policy from both editors to the server save call", () => {
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
        "checkpointPolicy: resolveCheckpointPolicy(toSaveToServerSource(source))",
      );
    }
  });

  it("creates interval checkpoints inside the backend PUT flow", () => {
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../../server/routes/files.js"),
      "utf8",
    );
    const putRouteSource = filesRouteSource.slice(
      filesRouteSource.indexOf('router.put("/:id"'),
      filesRouteSource.indexOf('router.get("/:id/thumbnail"'),
    );

    expect(filesRouteSource).toContain("CHECKPOINT_LABELS");
    expect(filesRouteSource).toContain("normalizeCheckpointPolicy");
    expect(filesRouteSource).toContain("maybeAppendCheckpoint");
    expect(putRouteSource).toContain(
      "const checkpointPolicy = normalizeCheckpointPolicy",
    );
    expect(putRouteSource).toContain("checkpoint = maybeAppendCheckpoint");
    expect(putRouteSource).toContain("checkpoint,");
  });
});
