import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("useMindMapDraftTracking source contract", () => {
  it("does not clear native dirty pending when content matches baseline", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useMindMapDraftTracking.ts"),
      "utf8",
    );

    expect(source).toContain("matchesMindMapPersistedSnapshot");
    expect(source).toContain("!isMindMapNativeDirtyPending(fileId)");
    expect(source).toContain(
      "draftTracking.markDocumentChanged.immediate",
    );
    expect(source).toContain(
      "draftTracking.markDocumentChanged.matchesPersistedSnapshot",
    );
  });
});
