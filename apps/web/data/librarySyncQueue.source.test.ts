import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("librarySyncQueue source contract", () => {
  it("syncs through apiTransport on all platforms", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "librarySyncQueue.ts"),
      "utf8",
    );

    expect(source).toContain("apiTransport");
    expect(source).toContain("/api/library/sync");
    expect(source).not.toContain("isDesktopEditorHub");
    expect(source).not.toContain("fetch(\"/api/library/sync\"");
  });
});
