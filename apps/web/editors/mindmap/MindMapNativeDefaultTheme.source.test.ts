import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeWebRoot = path.join(__dirname, "native", "web");

function readNativeSource(relativePath: string): string {
  return fs.readFileSync(path.join(nativeWebRoot, relativePath), "utf8");
}

describe("MindMap native default theme source contract", () => {
  it("uses the web default classic4 theme in runtime fallback data", () => {
    const runtime = readNativeSource("src/runtime/editor.mjs");
    const buildScript = readNativeSource("scripts/build.mjs");

    expect(runtime).toMatch(/const DEFAULT_THEME_TEMPLATE = ['"]classic4['"]/);
    expect(runtime).not.toMatch(/theme:\s*['"]default['"]/);
    expect(runtime).not.toMatch(/\|\|\s*['"]default['"]/);
    expect(buildScript).toMatch(/theme:\s*['"]classic4['"]/);
  });
});
