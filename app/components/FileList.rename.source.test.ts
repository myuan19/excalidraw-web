import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList rename interaction source contract", () => {
  it("suppresses the card open click when a rename interaction starts", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");
    const renderFileCard = source.slice(
      source.indexOf("const renderFileCard ="),
      source.indexOf("const empty = !loading"),
    );

    expect(source).toContain("suppressNextCardOpenRef");
    expect(renderFileCard).toContain("consumeSuppressedCardOpen(f.id)");
    expect(renderFileCard).toContain("onPointerDown={() => suppressNextCardOpen(f.id)}");
    expect(renderFileCard).toContain(
      "onPointerDown={(e) => {\n                  e.stopPropagation();\n                  suppressNextCardOpen(f.id);",
    );
  });
});
