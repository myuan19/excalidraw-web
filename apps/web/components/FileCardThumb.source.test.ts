import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

describe("FileCardThumb source contract", () => {
  it("renders thumbnail unsaved state as amber text badge", () => {
    const componentSource = read("FileCardThumb.tsx");

    expect(componentSource).toContain("filelist__card-thumb-badge");
    expect(componentSource).toContain("临时");
    expect(componentSource).toContain("未保存");
    expect(componentSource).not.toContain("filelist__card-thumb-badge--muted");
    expect(componentSource).not.toContain("FileCardThumbStatusDot");
  });
});
