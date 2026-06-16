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
    const hookTypesSource = read("hooks/types.ts");
    const filesRouteSource = fs.readFileSync(
      path.join(appRoot, "../server/routes/files.js"),
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
    expect(mindMapSaveSource).toContain("if (thumbnail)");
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
  });
});
