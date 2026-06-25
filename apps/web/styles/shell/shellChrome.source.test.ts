import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chromePath = path.join(__dirname, "shellChrome.scss");
const tokensPath = path.join(__dirname, "../notionUiTokens.scss");

describe("shell chrome design system", () => {
  it("defines shared chrome tokens and stable layout mixins", () => {
    const chrome = fs.readFileSync(chromePath, "utf8");
    const tokens = fs.readFileSync(tokensPath, "utf8");

    expect(tokens).toContain("--nb-shell-chrome-bg:");
    expect(tokens).toContain("--nb-shell-tab-strip-arrow-w:");
    expect(tokens).toContain("--nb-shell-tab-home-w:");
    expect(tokens).toContain("--nb-shell-tab-home-trailing-affordance-w:");
    expect(tokens).toContain("--nb-shell-toolbar-view-mode-slot-w:");
    expect(chrome).toContain("@mixin shell-chrome-bar");
    expect(chrome).toContain("@mixin shell-chrome-control");
    expect(chrome).toContain("@mixin shell-toolbar-slot");
    expect(chrome).toContain("@mixin shell-tab-strip");
    expect(chrome).toContain("&--visible");
    expect(chrome).not.toContain("backdrop-filter");
  });
});
