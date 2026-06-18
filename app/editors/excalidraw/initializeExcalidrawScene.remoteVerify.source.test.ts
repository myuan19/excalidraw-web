import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("initializeExcalidrawScene remote verify source contract", () => {
  it("keeps browser viewport restore scoped to open, not live remote verify", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "initializeExcalidrawScene.ts"),
      "utf8",
    );
    const verifyBody = source.slice(
      source.indexOf("export async function verifyExcalidrawRemoteAfterCachedOpen"),
    );

    expect(source).toContain("readForkBrowserAppStateOverlay(fileIdFromHash)");
    expect(verifyBody).toContain("applyRemoteExcalidrawScene");
    expect(verifyBody).toContain("preserveViewport: true");
    expect(verifyBody).not.toContain("readForkBrowserAppStateOverlay");
  });
});
