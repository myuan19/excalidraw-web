import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const syncScriptPath = path.join(__dirname, "sync-app-icon.mjs");
const sourcePngPath = path.join(repoRoot, "public/maskable_icon_x512.png");

describe("desktop icon sync source contract", () => {
  it("derives desktop pack icons from maskable_icon_x512.png only", () => {
    const source = fs.readFileSync(syncScriptPath, "utf8");

    expect(source).toContain("public/maskable_icon_x512.png");
    expect(source).toContain("icon.ico");
    expect(source).not.toContain("drawing-space.svg");
    expect(source).not.toContain("readLegacyEmbeddedPng");
    expect(source).not.toContain("Resvg");
  });

  it("ships the canonical web icon source", () => {
    expect(fs.existsSync(sourcePngPath)).toBe(true);
    const png = fs.readFileSync(sourcePngPath);
    expect(png.readUInt32BE(0)).toBe(0x89504e47);
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });
});
