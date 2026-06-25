import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(appRoot, rel), "utf8");
}

describe("interactionDebugTrace wiring", () => {
  it("traces thumb display, tabs, file open, and save flow via user-trace", () => {
    const traceSource = read("lib/interactionDebugTrace.ts");
    const thumbDisplay = read("data/fileCardThumbDisplay.ts");
    const tabNav = read("shell/editorTabNavigation.ts");
    const fileList = read("hooks/useFileListController.tsx");
    const thumbPending = read("data/thumbnailSavePending.ts");

    expect(traceSource).toContain("traceThumb");
    expect(traceSource).toContain("traceTab");
    expect(traceSource).toContain("traceFileOpen");
    expect(traceSource).toContain("traceSaveFlow");
    expect(thumbDisplay).toContain("traceThumbCardDisplay");
    expect(tabNav).toContain("traceTab");
    expect(fileList).toContain("traceFileOpen");
    expect(thumbPending).toContain("traceThumb");
  });
});
