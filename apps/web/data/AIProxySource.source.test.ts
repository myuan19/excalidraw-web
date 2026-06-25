import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

describe("AI proxy source contract", () => {
  it("routes Excalidraw AI through the same-origin server proxy", () => {
    const openaiSource = fs.readFileSync(
      path.join(appRoot, "data/openaiCompatibleStream.ts"),
      "utf8",
    );
    const aiClientSource = fs.readFileSync(
      path.join(appRoot, "data/aiClient.ts"),
      "utf8",
    );
    const aiComponentsSource = fs.readFileSync(
      path.join(appRoot, "components/AI.tsx"),
      "utf8",
    );
    const libraryAIMountSource = fs.readFileSync(
      path.join(appRoot, "data/libraryAIMount.ts"),
      "utf8",
    );

    expect(aiClientSource).toContain('fetch("/api/ai/chat"');
    expect(aiClientSource).toContain("/api/ai/vision");
    expect(openaiSource).toContain("streamAIChat");
    expect(openaiSource).toContain("requestAIVision");
    expect(openaiSource).not.toContain("Authorization");
    expect(openaiSource).not.toContain("Bearer");
    expect(aiComponentsSource).not.toContain("cfg.endpoint");
    expect(aiComponentsSource).not.toContain("cfg.apiKey");
    expect(libraryAIMountSource).not.toContain("cfg.endpoint");
    expect(libraryAIMountSource).not.toContain("cfg.apiKey");
  });

  it("keeps upstream API keys and Cherry Studio profile on the server side", () => {
    const aiProxySource = fs.readFileSync(
      path.join(appRoot, "../../server/lib/aiProxy.js"),
      "utf8",
    );
    const upstreamProfilesSource = fs.readFileSync(
      path.join(appRoot, "../../server/lib/aiUpstreamProfiles.js"),
      "utf8",
    );
    const aiProxyRouteSource = fs.readFileSync(
      path.join(appRoot, "../../server/routes/ai-proxy.js"),
      "utf8",
    );

    expect(upstreamProfilesSource).toContain("CherryStudio/1.9.6");
    expect(upstreamProfilesSource).toContain("Authorization");
    expect(upstreamProfilesSource).toContain('"x-title": "Cherry Studio"');
    expect(upstreamProfilesSource).toContain(
      '"http-referer": "https://cherry-ai.com"',
    );
    expect(aiProxySource).toContain("buildUpstreamHeaders");
    expect(aiProxyRouteSource).toContain('router.post("/chat"');
    expect(aiProxyRouteSource).toContain('router.post("/vision"');
  });
});
