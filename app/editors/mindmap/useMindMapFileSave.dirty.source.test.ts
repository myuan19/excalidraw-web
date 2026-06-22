import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("useMindMapFileSave dirty clear source contract", () => {
  it("does not clear dirty on persisted snapshot while native dirty is pending", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useMindMapFileSave.ts"),
      "utf8",
    );
    expect(source).toContain("isMindMapNativeDirtyPending");
    expect(source).toContain(
      "!isMindMapNativeDirtyPending(fileId) &&\n        matchesMindMapPersistedSnapshot(fileId, document)",
    );
  });
});
