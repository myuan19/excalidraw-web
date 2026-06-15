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
  it("lets MindMap saves explicitly clear stale server thumbnails", () => {
    const serverSyncSource = read("data/ServerSync.ts");
    const mindMapSaveSource = read("editors/mindmap/useMindMapFileSave.ts");
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

    expect(mindMapSaveSource).toContain(
      "const contentChanged = !baseline || hash !== baseline",
    );
    expect(mindMapSaveSource).toContain(
      "thumbnail ?? (contentChanged ? null : undefined)",
    );

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
