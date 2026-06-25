import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bootstrapPath = path.join(__dirname, "bootstrapBackend.mjs");

describe("bootstrapBackend source contracts", () => {
  it("uses desktop JSON adapters instead of SQLite server routes", () => {
    const source = fs.readFileSync(bootstrapPath, "utf8");

    expect(source).toContain("createDesktopLibraryRouter");
    expect(source).toContain("createDesktopTtdChatsRouter");
    expect(source).toContain("createDesktopAiProxyRouter");
    expect(source).toContain("createDesktopMindMapAiRouter");
    expect(source).not.toContain("server/routes/library.js");
    expect(source).not.toContain("server/routes/ttd-chats.js");
    expect(source).not.toContain("server/routes/ai-proxy.js");
    expect(source).not.toContain("server/routes/mindmap-ai.js");
    expect(source).toContain("includeDefaultRoutes: false");
  });
});
