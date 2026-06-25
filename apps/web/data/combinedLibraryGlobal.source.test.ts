import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");

describe("combined library global source contract", () => {
  it("loads merged personal and public rows through the global library endpoint", () => {
    const adapterSource = fs.readFileSync(
      path.join(appRoot, "data/CombinedLibraryAdapter.ts"),
      "utf8",
    );
    const serverLibrarySource = fs.readFileSync(
      path.join(repoRoot, "server/routes/library.js"),
      "utf8",
    );
    const packageTypesSource = fs.readFileSync(
      path.join(repoRoot, "packages/excalidraw/types.ts"),
      "utf8",
    );
    const libraryMenuSource = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/excalidraw/components/LibraryMenuItems.tsx",
      ),
      "utf8",
    );

    expect(serverLibrarySource).toContain('router.get("/global"');
    expect(adapterSource).toContain("apiTransport");
    expect(adapterSource).toContain('apiJson<ServerLibraryItem[]>("/library/global")');
    expect(adapterSource).not.toContain('apiJson<ServerLibraryItem[]>("/library/personal")');
    expect(adapterSource).toContain('scope: "global"');
    expect(packageTypesSource).toContain('"global"');
    expect(libraryMenuSource).not.toContain("libraryTab");
    expect(libraryMenuSource).not.toContain("libraryTabPersonal");
    expect(libraryMenuSource).not.toContain("libraryTabPublic");
  });
});
