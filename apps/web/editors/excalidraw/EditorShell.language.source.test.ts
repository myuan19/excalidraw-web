import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EditorShell language source contract", () => {
  it("passes unified app langCode into Excalidraw", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("useAppLangCode");
    expect(source).toContain("langCode={langCode}");
    expect(source).toContain("LanguageList");
  });
});
