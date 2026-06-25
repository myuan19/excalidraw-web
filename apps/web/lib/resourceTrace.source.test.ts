import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("resource trace wiring", () => {
  it("boots at app entry and wraps API transport", () => {
    const indexSource = read("index.tsx");
    const apiTransportSource = read("data/apiTransport.ts");
    const apiTransportTraceWrapSource = read("data/apiTransportTraceWrap.ts");
    const resourceTraceSource = read("lib/resourceTrace.ts");

    expect(indexSource).toContain("bootResourceTrace");
    expect(apiTransportSource).toContain("apiTransportTraceWrap");
    expect(apiTransportTraceWrapSource).toContain("wrapApiTransportWithResourceTrace");
    expect(resourceTraceSource).toContain("traceApiCall");
    expect(resourceTraceSource).toContain("getResourceTraceSummary");
    expect(resourceTraceSource).toContain("api.rapid-duplicate");
  });

  it("hooks high-cost paths in file list, thumbnails, and save queue", () => {
    const fileListSource = read("hooks/useFileListController.tsx");
    const thumbPipelineSource = read("hooks/useThumbnailPipeline.ts");
    const saveQueueSource = read("data/saveQueue.ts");
    const userTraceSource = read("lib/userTrace.ts");

    expect(fileListSource).toContain("traceResourceOp");
    expect(fileListSource).toContain("traceTreeStateApply");
    expect(fileListSource).toContain('"filelist", "refresh"');
    expect(fileListSource).toContain('"filelist", "scheduleSilentRefresh"');
    expect(thumbPipelineSource).toContain('"thumbnail", "effectTick"');
    expect(saveQueueSource).toContain('"saveQueue", "drain"');
    expect(userTraceSource).toContain("mergeResourceTraceGlobals");
    expect(userTraceSource).toContain("resourceSummary");
  });
});
