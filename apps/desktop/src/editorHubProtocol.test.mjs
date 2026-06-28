import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EDITORHUB_APP_INDEX_URL,
  safeStaticPath,
} from "./editorHubProtocol.mjs";

describe("editorHubProtocol", () => {
  it("defines the desktop SPA entry URL", () => {
    expect(EDITORHUB_APP_INDEX_URL).toBe("editorhub://app/index.html");
  });

  it("resolves static files inside the build root", () => {
    const buildRoot = mkdtempSync(path.join(os.tmpdir(), "editorhub-build-"));
    writeFileSync(path.join(buildRoot, "index.html"), "<html></html>");
    mkdirSync(path.join(buildRoot, "mind-map"), { recursive: true });
    writeFileSync(
      path.join(buildRoot, "mind-map", "index.html"),
      "<html></html>",
    );

    expect(safeStaticPath(buildRoot, "/index.html")).toBe(
      path.join(buildRoot, "index.html"),
    );
    expect(safeStaticPath(buildRoot, "/mind-map/index.html")).toBe(
      path.join(buildRoot, "mind-map", "index.html"),
    );
  });

  it("rejects path traversal", () => {
    const buildRoot = mkdtempSync(path.join(os.tmpdir(), "editorhub-build-"));
    expect(safeStaticPath(buildRoot, "/../package.json")).toBeNull();
  });

  it("serves static files from disk buffers in protocol handler source", () => {
    const protocolPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "editorHubProtocol.mjs",
    );
    const source = readFileSync(protocolPath, "utf8");

    expect(source).toContain("readFileSync(picked.filePath)");
    expect(source).not.toContain("createReadStream");
    expect(source).toContain("Access-Control-Allow-Origin");
  });
});
