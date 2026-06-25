import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(serverRoot, relativePath), "utf8");
}

describe("server logging event source contract", () => {
  it("keeps client log ingestion diagnostics on stable debug events", () => {
    const logsSource = read("routes/logs.js");

    expect(logsSource).toContain("`collector.ingest.${event}`");
    expect(logsSource).toContain("rate_limited");
    expect(logsSource).toContain("batch_ingested");
  });
});
