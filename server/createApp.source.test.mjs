import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const createAppPath = path.join(__dirname, "createApp.js");

describe("createApp source contracts", () => {
  it("allows desktop to override library and ttd chat routers", () => {
    const source = fs.readFileSync(createAppPath, "utf8");

    expect(source).toContain("options.libraryRouter");
    expect(source).toContain("options.ttdChatsRouter");
  });
});
