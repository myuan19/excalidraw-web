import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Sidebar source wiring", () => {
  it("imports Sidebar.scss so .sidebar positioning reaches the app bundle", () => {
    const source = fs.readFileSync(
      path.join(import.meta.dirname, "Sidebar.tsx"),
      "utf8",
    );
    expect(source).toContain('import "./Sidebar.scss"');
    expect(source).toContain("appState.openSidebar?.name === name");
    expect(source).toContain("onCloseRequest: closeSidebar");
    expect(source).toContain("setAppState({ openSidebar: null })");
  });
});
