import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("MindMap thumbnail persistence source contract", () => {
  it("keeps native MindMap thumbnails authoritative without clearing stale ones prematurely", () => {
    const serverSyncSource = read("data/ServerSync.ts");
    const mindMapSaveSource = read("editors/mindmap/useMindMapFileSave.ts");
    const mindMapShellSource = read("editors/mindmap/MindMapEditorShell.tsx");
    const thumbnailPersistenceSource = read("data/fileThumbnailPersistence.ts");
    const hookTypesSource = read("hooks/types.ts");
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../server/routes/files.js"),
      "utf8",
    );
    const putRouteSource = filesRouteSource.slice(
      filesRouteSource.indexOf('router.put("/:id"'),
      filesRouteSource.indexOf('router.get("/:id/thumbnail"'),
    );
    const thumbnailPutRouteSource = filesRouteSource.slice(
      filesRouteSource.indexOf('router.put("/:id/thumbnail"'),
      filesRouteSource.indexOf('router.get("/:id/thumbnail"'),
    );

    expect(serverSyncSource).toContain("thumbnail?: string | null");
    expect(serverSyncSource).toContain(
      "const hasThumbnailField = thumbnail !== undefined",
    );
    expect(serverSyncSource).toContain(
      "hasThumbnailField ? { thumbnail } : {}",
    );
    expect(serverSyncSource).toContain("saveFileThumbnail");
    expect(serverSyncSource).toContain("`/files/${id}/thumbnail`");

    expect(mindMapSaveSource).toContain("scheduleSavedFileThumbnailUpload");
    expect(mindMapSaveSource).toContain("onServerSaveCommitted");
    expect(mindMapSaveSource).toContain(
      "resolveFileThumbnailForPut: async () => undefined",
    );
    expect(mindMapSaveSource).not.toContain("shouldUploadFileThumbnailInline");
    expect(mindMapSaveSource).not.toContain("uploadedInline");
    expect(thumbnailPersistenceSource).toContain(
      "markPendingSavedFileThumbnail",
    );
    expect(thumbnailPersistenceSource).toContain(
      "function markThumbnailGenerationPending",
    );
    expect(thumbnailPersistenceSource).toContain(
      "function completeGeneratedThumbnailLocally",
    );
    expect(thumbnailPersistenceSource).toContain(
      "function queueServerThumbnailUpload",
    );
    expect(mindMapShellSource).toContain("lastSavedThumbnailTargetRef");
    expect(mindMapShellSource).toContain("scheduleSavedFileThumbnailUpload");
    expect(mindMapShellSource).toContain(
      "savedTarget.documentHash === currentHash",
    );
    expect(mindMapSaveSource).toContain("documentHash: hash");
    expect(mindMapShellSource).toContain('source: "thumbnail"');
    expect(mindMapShellSource).toContain("shouldRefreshMindMapServerThumbnail");
    expect(mindMapShellSource).toContain("isSchematicMindMapThumbnailSvg");
    expect(hookTypesSource).toContain('"thumbnail"');

    expect(putRouteSource).toContain("Object.prototype.hasOwnProperty.call(");
    expect(putRouteSource).toContain('"thumbnail",');
    expect(putRouteSource).toContain(
      "const clearThumb = req.body.thumbnail === null",
    );
    expect(putRouteSource).toContain(
      "const mutatesThumbnail = hasThumb || clearThumb",
    );
    expect(putRouteSource).toContain("rmSync(thumbFile, { force: true })");
    expect(putRouteSource).toContain("rmSync(metaFile, { force: true })");
    expect(thumbnailPutRouteSource).toContain('router.put("/:id/thumbnail"');
    expect(thumbnailPutRouteSource).toContain("normalizeThumbnailSvgInput");
    expect(thumbnailPutRouteSource).toContain("stale_thumbnail");
    expect(thumbnailPutRouteSource).toContain(
      "contentSha256 !== currentSha",
    );
  });
});
