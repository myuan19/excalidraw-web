import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EditorTabCacheHost source contract", () => {
  it("delegates file panes to EditorPaneStack and uses startup shell mode", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorTabCacheHost.tsx"),
      "utf8",
    );

    expect(source).toContain("EditorPaneStack");
    expect(source).not.toContain("CachedFileEditorPane");
    expect(source).toContain("useStartupShellMode");
    expect(source).not.toContain("restoreDesktopEditorSession");
  });
});

describe("startup module contracts", () => {
  it("defines coordinator and queue entry points", () => {
    const coordinator = fs.readFileSync(
      path.join(__dirname, "../startup/StartupCoordinator.ts"),
      "utf8",
    );
    expect(coordinator).toContain("PriorityTaskQueue");
    expect(coordinator).toContain("resolveStartupIntent");
    expect(coordinator).toContain("restoreDesktopEditorSession");
  });
});
