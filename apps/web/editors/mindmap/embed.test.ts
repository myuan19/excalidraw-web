import { describe, expect, it } from "vitest";

import { SIMPLE_MIND_MAP_VERSION } from "../../data/formats/MindMapAdapter";
import { buildMindMapEmbedBridgePayload, prepareMindMapEmbedData } from "./embed";
import { mindMapDataWithStrongChild } from "./mindMapHydrateDraftPolicy";

describe("buildMindMapEmbedBridgePayload", () => {
  it("stamps smmVersion like the editor shell so RichText keeps inline styles", () => {
    const data = mindMapDataWithStrongChild(
      '<p><span style="background-color: rgb(219, 223, 0);">hl</span></p>',
    );
    expect((data.root as Record<string, unknown>).smmVersion).toBeUndefined();

    const payload = buildMindMapEmbedBridgePayload(data);
    expect(
      (payload.mindMapData.root as Record<string, unknown>).smmVersion,
    ).toBe(SIMPLE_MIND_MAP_VERSION);
  });

  it("strips view and marks embed readonly", () => {
    const data = {
      ...mindMapDataWithStrongChild("<p><span>t</span></p>"),
      view: { scale: 2, x: 1, y: 1 },
    };

    const payload = buildMindMapEmbedBridgePayload(data);
    expect(payload.mindMapData.view).toBeUndefined();
    expect(payload.embedMode).toBe(true);
    expect(payload.readOnly).toBe(true);
  });

  it("drops legacy polluted outer frame padding so embeds use the default", () => {
    const data = prepareMindMapEmbedData({
      ...mindMapDataWithStrongChild("<p><span>t</span></p>"),
      config: {
        maxNodeImageStorageBytes: 8388608,
        outerFramePaddingX: 0,
        outerFramePaddingY: 0,
      },
    });

    const payload = buildMindMapEmbedBridgePayload(data);
    const config = payload.mindMapConfig as Record<string, unknown>;
    expect(config.outerFramePaddingX).toBeUndefined();
    expect(config.outerFramePaddingY).toBeUndefined();
  });
});
