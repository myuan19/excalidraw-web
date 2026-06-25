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
    const mindMapThumbnailSource = read("data/mindMapThumbnail.ts");
    const mindMapRendererSource = read(
      "editors/mindmap/mindMapNativeThumbnailRenderer.ts",
    );
    const localThumbnailCacheSource = read("data/localThumbnailCache.ts");
    const hookTypesSource = read("hooks/types.ts");
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../../server/routes/files.js"),
      "utf8",
    );
    const putRouteSource = filesRouteSource.slice(
      filesRouteSource.indexOf('router.put("/:id"'),
      filesRouteSource.indexOf('router.get("/:id/thumbnail"'),
    );

    expect(serverSyncSource).toContain("thumbnail?: string | null");
    expect(serverSyncSource).toContain(
      "const hasThumbnailField = thumbnail !== undefined",
    );
    expect(serverSyncSource).toContain(
      "hasThumbnailField ? { thumbnail } : {}",
    );

    expect(mindMapSaveSource).toContain("thumbnail ?? undefined");
    expect(mindMapSaveSource).toContain('source === "thumbnail"');
    expect(mindMapSaveSource).toContain("ServerSync.saveThumbnailOnly");
    expect(mindMapSaveSource).not.toContain(
      "thumbnail ?? (contentChanged ? null : undefined)",
    );
    expect(mindMapThumbnailSource).not.toContain(
      "ServerSync.saveFileImmediate",
    );
    expect(mindMapThumbnailSource).toContain("FileSyncState.hasUnsavedChanges");
    expect(mindMapThumbnailSource).toContain("clearThumbnailServerMiss");
    expect(mindMapThumbnailSource).toContain("excalidraw-file-list-refresh");
    expect(mindMapThumbnailSource).toContain("excalidraw-file-sync-state");
    expect(mindMapShellSource).toContain('source: "thumbnail"');
    expect(mindMapShellSource).toContain("shouldRefreshMindMapServerThumbnail");
    expect(mindMapShellSource).toContain("isNativeMindMapThumbnailSvg");
    expect(mindMapShellSource).not.toContain("isSchematicMindMapThumbnailSvg");
    expect(mindMapThumbnailSource).toContain("mindMapNativeThumbnailRenderer");
    expect(mindMapThumbnailSource).toContain("cacheDraftThumbnailIfVisible");
    expect(mindMapThumbnailSource).toContain("finalizeSavedThumbnail");
    expect(mindMapThumbnailSource).not.toContain("LocalThumbnailCache.set");
    expect(mindMapRendererSource).toContain("cacheDraftThumbnailIfVisible");
    expect(mindMapRendererSource).not.toContain("LocalThumbnailCache.set");
    expect(localThumbnailCacheSource).toContain("getForContent");
    expect(hookTypesSource).toContain('"thumbnail"');

    expect(putRouteSource).toContain(
      'Object.prototype.hasOwnProperty.call(req.body, "thumbnail")',
    );
    expect(putRouteSource).toContain(
      "const clearThumb = req.body.thumbnail === null",
    );
    expect(putRouteSource).toContain(
      "const mutatesThumbnail = hasThumb || clearThumb",
    );
    expect(putRouteSource).toContain("rmSync(thumbFile, { force: true })");
    expect(putRouteSource).toContain("rmSync(metaFile, { force: true })");
  });
});
