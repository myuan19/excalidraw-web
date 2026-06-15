import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList import queue source contract", () => {
  it("uses limited concurrency for auto-detected imports", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain("const FILE_IMPORT_CONCURRENCY = 3");
    expect(source).toContain(
      "const batch = queue.slice(0, FILE_IMPORT_CONCURRENCY)",
    );
    expect(source).toContain("await Promise.allSettled");
    expect(source).toContain("pendingImportFileRef.current = file");
  });
});
