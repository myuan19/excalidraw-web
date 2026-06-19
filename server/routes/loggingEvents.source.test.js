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
  it("keeps document save/fetch diagnostics on stable debug events", () => {
    const filesSource = read("routes/files.js");

    expect(filesSource).toContain("`doc.version.${event}`");
    expect(filesSource).toContain("hash_list");
    expect(filesSource).toContain("remote_fetch");
    expect(filesSource).toContain("server_conflict");
    expect(filesSource).toContain("server_increment");
    expect(filesSource).toContain("`server.files.${event}`");
    expect(filesSource).toContain("put.start");
    expect(filesSource).toContain("put.version_conflict");
    expect(filesSource).toContain("put.saved");
  });

  it("keeps client log ingestion diagnostics on stable debug events", () => {
    const logsSource = read("routes/logs.js");

    expect(logsSource).toContain("`collector.ingest.${event}`");
    expect(logsSource).toContain("rate_limited");
    expect(logsSource).toContain("batch_ingested");
  });
});
