import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TTDStorage source contract", () => {
  it("loads and saves chats through apiTransport", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "TTDStorage.ts"),
      "utf8",
    );

    expect(source).toContain("apiTransport");
    expect(source).toContain("/api/ttd-chats");
    expect(source).not.toContain("isDesktopEditorHub");
    expect(source).not.toContain("fetch(\"/api/ttd-chats\"");
  });
});
