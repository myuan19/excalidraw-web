import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("desktop logger source contract", () => {
  it("maps explicit desktop debug startup to server debug capability", () => {
    const source = fs.readFileSync(path.join(__dirname, "desktopLogger.mjs"), "utf8");

    expect(source).toContain("function envFlagOn(value)");
    expect(source).toContain("isDesktopDebugCapabilityEnabled()");
    expect(source).toContain("envFlagOn(process.env.EDITORHUB_DESKTOP_DEBUG)");
    expect(source).toContain('process.env.EDITORHUB_DEBUG_ENABLED ||= "1"');
    expect(source).toContain("debugAllowed: isDesktopDebugCapabilityEnabled()");
  });
});
