import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readDropdownStyles(): string {
  return fs.readFileSync(path.join(__dirname, "DropdownMenu.scss"), "utf8");
}

function readMainMenuSource(): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "main-menu", "MainMenu.tsx"),
    "utf8",
  );
}

describe("DropdownMenu styles source contract", () => {
  it("resets menu items and constrains SVG icon size", () => {
    const source = readDropdownStyles();

    expect(source).toContain(".dropdown-menu-item-base");
    expect(source).toContain("background: none");
    expect(source).toContain(".dropdown-menu-item__icon");
    expect(source).toContain("width: 1rem");
    expect(source).toContain("height: 1rem");
  });

  it("keeps dropdown wrapper stacking without display: contents", () => {
    const source = readDropdownStyles();

    expect(source).toMatch(/\.dropdown-menu\s*\{[^}]*z-index:\s*1/);
    expect(source).not.toMatch(
      /^\.dropdown-menu\s*\{\s*display:\s*contents;/m,
    );
  });

  it("floats the main menu as an overlay instead of pushing siblings", () => {
    const source = readDropdownStyles();

    // matches the web build (radix-ui) where the open menu overlays the
    // selected-shape actions rather than displacing them in normal flow.
    expect(source).toMatch(
      /&\.main-menu:not\(\.dropdown-menu--mobile\)\s*\{[^}]*position:\s*absolute/,
    );
  });

  it("tags the main menu content so overlay styles + z-index apply", () => {
    const source = readMainMenuSource();

    expect(source).toMatch(/<DropdownMenu\.Content[^>]*className="main-menu"/s);
  });
});
