import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getRuntimeRoot, loadRuntimeServerModule } from "./runtimeServerLib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("runtimeServerLib", () => {
  it("resolves server lib from repo root in development", () => {
    const runtimeRoot = getRuntimeRoot();
    expect(
      existsSync(path.join(runtimeRoot, "server/lib/aiProxy.js")),
    ).toBe(true);
  });

  it("loads aiProxy helpers from the resolved runtime root", async () => {
    const module = await loadRuntimeServerModule("lib/aiProxy.js");
    expect(typeof module.buildAIProxyChatRequest).toBe("function");
    expect(typeof module.streamProxyResponse).toBe("function");
  });

  it("loads ai settings config from the resolved runtime root", async () => {
    const module = await loadRuntimeServerModule("lib/aiSettingsConfig.js");
    expect(typeof module.emptyConfig).toBe("function");
    expect(typeof module.normalizeConfig).toBe("function");
  });
});
