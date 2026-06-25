import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(serverRoot, relativePath), "utf8");
}

describe("file thumbnail persistence source contract", () => {
  it("keeps thumbnail-only writes out of document updated_at and version", () => {
    const source = read("routes/files.js");

    expect(source).toContain("const thumbnailOnlyWrite =");
    expect(source).toContain("const carriesDocumentCheckpointIntent =");
    expect(source).toContain(
      "if (skipDataWrite && !nameChanged && !mutatesThumbnail)",
    );
    expect(source).toContain("!carriesDocumentCheckpointIntent");
    expect(source).toContain("if (thumbnailOnlyWrite) {");
    expect(source).toContain("content_sha256: row.content_sha256 ?? null");
    expect(source).toContain("version: currentFileVersion(row.version)");
    expect(source).toContain("updated_at: row.updated_at");

    const thumbnailOnlyBlock = source.slice(
      source.indexOf("if (thumbnailOnlyWrite) {"),
      source.indexOf("const now = new Date().toISOString();"),
    );

    expect(thumbnailOnlyBlock).not.toContain("UPDATE files SET updated_at");
    expect(thumbnailOnlyBlock).not.toContain("version = ?");
  });
});
