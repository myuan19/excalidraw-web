import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("verifyExcalidrawCachedOpen source contract", () => {
  it("accepts explicit fileId and preserves viewport on remote apply", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "verifyExcalidrawCachedOpen.ts"),
      "utf8",
    );
    const shellSource = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("fileId: string");
    expect(source).not.toContain("getFileIdFromHash");
    expect(source).toContain("ensureSessionVersionAfterCacheOpen");
    expect(source).toContain("preserveViewport: true");
    expect(shellSource).toContain("verifyExcalidrawRemoteAfterCachedOpen");
    expect(shellSource).toContain("pendingCachedOpenVerifyRef");
  });
});
