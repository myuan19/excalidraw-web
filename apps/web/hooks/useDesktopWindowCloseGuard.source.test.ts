import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("useDesktopWindowCloseGuard source contract", () => {
  it("prepares all open editor tabs before allowing window close", () => {
    const hookSource = fs.readFileSync(
      path.join(__dirname, "useDesktopWindowCloseGuard.ts"),
      "utf8",
    );
    const appSource = fs.readFileSync(
      path.join(__dirname, "../App.tsx"),
      "utf8",
    );
    const mainSource = fs.readFileSync(
      path.join(__dirname, "../../desktop/electron/main.mjs"),
      "utf8",
    );
    const preloadSource = fs.readFileSync(
      path.join(__dirname, "../../desktop/electron/preload.mjs"),
      "utf8",
    );
    const titleBarSource = fs.readFileSync(
      path.join(__dirname, "../components/DesktopTitleBar.tsx"),
      "utf8",
    );

    expect(hookSource).toContain("prepareDesktopWindowClose");
    expect(hookSource).toContain("snapshotDesktopWindowCloseSession");
    expect(hookSource).not.toContain("WINDOW_CLOSE_PREPARE_TIMEOUT_MS");
    expect(hookSource).toContain("onWindowCloseRequested");
    expect(hookSource).toContain("finishWindowClose");
    expect(appSource).toContain("useDesktopWindowCloseGuard");
    expect(mainSource).toContain("desktop:windowCloseRequested");
    expect(mainSource).toContain("desktop:finishWindowClose");
    expect(mainSource).toContain("mainWindowCloseAllowed");
    expect(preloadSource).toContain("requestWindowClose");
    expect(preloadSource).toContain("finishWindowClose");
    expect(preloadSource).toContain("onWindowCloseRequested");
    expect(titleBarSource).toContain("requestWindowClose");
  });
});
