import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

describe("editor host actions thumbnail lifecycle contract", () => {
  it("finalizes Excalidraw create/import thumbnails with the saved content hash", () => {
    const source = read("excalidraw/hostActions.ts");

    expect(source).toContain("finalizeSavedThumbnail");
    expect(source).not.toContain("LocalThumbnailCache.set");
  });

  it("finalizes MindMap create/import thumbnails with the saved content hash", () => {
    const source = read("mindmap/hostActions.ts");

    expect(source).toContain("finalizeSavedThumbnail");
    expect(source).not.toContain("LocalThumbnailCache.set");
  });
});
