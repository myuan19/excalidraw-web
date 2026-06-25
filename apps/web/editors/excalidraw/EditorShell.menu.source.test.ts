import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEditorShell(): string {
  return fs.readFileSync(path.join(__dirname, "EditorShell.tsx"), "utf8");
}

describe("Excalidraw editor menu source contract", () => {
  it("injects an EditorHub main menu instead of exposing Excalidraw fallback file links", () => {
    const source = readEditorShell();

    expect(source).toContain("MainMenu");
    expect(source).toContain("<MainMenu>");
    expect(source).not.toContain("DefaultItems.LoadScene");
    expect(source).not.toContain("DefaultItems.SaveToActiveFile");
    expect(source).not.toContain("DefaultItems.Socials");
  });

  it("registers the welcome screen hints for empty new documents", () => {
    const source = readEditorShell();

    expect(source).toContain("AppWelcomeScreen");
    expect(source).toContain("<AppWelcomeScreen />");
  });

  it("listens for unified editor host commands and legacy sidebar events", () => {
    const source = readEditorShell();

    expect(source).toContain("EDITOR_HOST_COMMAND_EVENT");
    expect(source).toContain('case "export"');
    expect(source).toContain('case "import"');
    expect(source).toContain('case "history"');
    expect(source).toContain('case "embed"');
    expect(source).toContain("excalidraw-host-open-export");
    expect(source).toContain("ArchivePanel");
    expect(source).toContain("isDesktopEditorHub()");
    expect(source).toContain("EmbedTokenManager");
  });
});
