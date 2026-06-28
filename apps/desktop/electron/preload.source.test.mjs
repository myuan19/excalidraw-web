import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(__dirname, "preload.mjs");

describe("desktop preload contracts", () => {
  it("exposes IPC API bridge for renderer transport", () => {
    const source = fs.readFileSync(preloadPath, "utf8");

    expect(source).toContain("editorHubDesktop");
    expect(source).toContain("invokeApi");
    expect(source).toContain("editorhub:api");
    expect(source).toContain("subscribeCatalogChanges");
    expect(source).toContain("editorhub:catalog-change");
    expect(source).toContain("getAppDataDirectoryPath");
    expect(source).toContain("subscribeOpenDocumentPaths");
    expect(source).toContain("consumeOpenDocumentPaths");
  });
});
