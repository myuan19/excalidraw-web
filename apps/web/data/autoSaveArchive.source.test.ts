import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

describe("auto-save archive source contract", () => {
  it("keeps archive classification on the save request instead of post-save patching", () => {
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

    expect(autoSaveSessionSource).toContain("resolveAutoSaveArchiveLabel");
    expect(autoSaveSessionSource).toContain('source === "visibility"');
    expect(saveQueueSource).not.toContain("manageSessionAutoArchive");
    expect(serverSyncSource).not.toContain("ensureArchiveHeadroomBeforeSave");
    expect(serverSyncSource).toContain("archiveLabel: opts?.archiveLabel");
    expect(serverSyncSource).toContain("{ archiveLabel: opts.archiveLabel }");
  });

  it("passes auto-save archive labels from both editors to the server save call", () => {
    const excalidrawSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/excalidraw/useForkFileSave.ts"),
      "utf8",
    );
    const mindMapSaveSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/useMindMapFileSave.ts"),
      "utf8",
    );

    for (const source of [excalidrawSaveSource, mindMapSaveSource]) {
      expect(source).toContain("resolveAutoSaveArchiveLabel");
      expect(source).toContain(
        "archiveLabel: resolveAutoSaveArchiveLabel(source)",
      );
    }
  });

  it("creates and trims auto-save archives inside the backend PUT flow", () => {
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../../server/routes/files.js"),
      "utf8",
    );
    const putRouteSource = filesRouteSource.slice(
      filesRouteSource.indexOf('router.put("/:id"'),
      filesRouteSource.indexOf('router.get("/:id/thumbnail"'),
    );

    expect(filesRouteSource).toContain("AUTO_ARCHIVE_LABEL_PREFIX");
    expect(filesRouteSource).toContain("deleteArchivesByLabel(fileId, label)");
    expect(filesRouteSource).toContain(
      "appendVersionSnapshot(fileId, dataObj, options = {})",
    );
    expect(filesRouteSource).toContain(
      "CASE WHEN label LIKE 'auto:%' THEN 0 ELSE 1 END",
    );
    expect(putRouteSource).toContain(
      "const archiveLabel = normalizeArchiveLabel",
    );
    expect(putRouteSource).toContain(
      "appendVersionSnapshot(id, req.body.data, { label: archiveLabel })",
    );
  });
});
