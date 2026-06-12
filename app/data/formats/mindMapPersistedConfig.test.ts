import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyMindMapMediaLimitsToConfig } from "../../editors/mindmap/mindMapMediaLimits";
import {
  compactMindMapPersistedConfig,
  isMindMapRuntimeConfigKey,
  OUTER_FRAME_PADDING_DEFAULT,
  repairLegacyMindMapConfig,
} from "./mindMapPersistedConfig";
import { MindMapAdapter } from "./MindMapAdapter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("compactMindMapPersistedConfig", () => {
  it("strips host-injected runtime keys", () => {
    expect(
      compactMindMapPersistedConfig({
        maxNodeImageStorageBytes: 8388608,
        maxNodeImageStorageWidth: 8192,
        maxNodeImageStorageHeight: 8192,
        __nbPreviewTargetX: 0.5,
        customKey: "kept",
      }),
    ).toEqual({ customKey: "kept" });
  });

  it("drops outer frame padding equal to the library default", () => {
    expect(
      compactMindMapPersistedConfig({
        outerFramePaddingX: OUTER_FRAME_PADDING_DEFAULT,
        outerFramePaddingY: OUTER_FRAME_PADDING_DEFAULT,
      }),
    ).toBeUndefined();
  });

  it("keeps explicit non-default padding, including zero", () => {
    expect(
      compactMindMapPersistedConfig({
        outerFramePaddingX: 0,
        outerFramePaddingY: 20,
      }),
    ).toEqual({ outerFramePaddingX: 0, outerFramePaddingY: 20 });
  });

  it("drops a rainbow lines config equivalent to the disabled default", () => {
    expect(
      compactMindMapPersistedConfig({
        rainbowLinesConfig: { open: false, colorsList: [] },
      }),
    ).toBeUndefined();
    expect(
      compactMindMapPersistedConfig({
        rainbowLinesConfig: { open: false },
      }),
    ).toBeUndefined();
  });

  it("keeps enabled or customized rainbow lines config", () => {
    const enabled = { rainbowLinesConfig: { open: true, colorsList: [] } };
    expect(compactMindMapPersistedConfig(enabled)).toEqual(enabled);
    const customColors = {
      rainbowLinesConfig: { open: false, colorsList: ["red"] },
    };
    expect(compactMindMapPersistedConfig(customColors)).toEqual(customColors);
  });

  it("returns the same reference when nothing needs dropping", () => {
    const config = { outerFramePaddingX: 4 };
    expect(compactMindMapPersistedConfig(config)).toBe(config);
  });

  it("returns undefined for empty or missing config", () => {
    expect(compactMindMapPersistedConfig(undefined)).toBeUndefined();
    expect(compactMindMapPersistedConfig(null)).toBeUndefined();
    expect(compactMindMapPersistedConfig({})).toBeUndefined();
  });
});

describe("repairLegacyMindMapConfig", () => {
  it("repairs configs carrying the leaked-runtime-key fingerprint", () => {
    // 实测污染样例：旧版桥接把宿主注入键和 padding 0 整圈回写进了文档
    expect(
      repairLegacyMindMapConfig({
        maxNodeImageStorageBytes: 8388608,
        maxNodeImageStorageWidth: 8192,
        maxNodeImageStorageHeight: 8192,
        outerFramePaddingX: 0,
        outerFramePaddingY: 0,
        rainbowLinesConfig: { open: false, colorsList: [] },
      }),
    ).toEqual({ rainbowLinesConfig: { open: false, colorsList: [] } });
  });

  it("returns undefined when every entry was pollution", () => {
    expect(
      repairLegacyMindMapConfig({
        maxNodeImageStorageBytes: 8388608,
        outerFramePaddingX: 0,
        outerFramePaddingY: 0,
      }),
    ).toBeUndefined();
  });

  it("drops the both-zero padding pair even without a fingerprint", () => {
    // 指纹可能已被先行的 compact 销毁而 0 残留（实测污染形态）
    expect(
      repairLegacyMindMapConfig({
        outerFramePaddingX: 0,
        outerFramePaddingY: 0,
        customKey: "kept",
      }),
    ).toEqual({ customKey: "kept" });
  });

  it("keeps a single-axis zero padding when there is no fingerprint", () => {
    const config = { outerFramePaddingX: 0, outerFramePaddingY: 14 };
    expect(repairLegacyMindMapConfig(config)).toBe(config);
  });

  it("keeps non-zero padding even alongside the fingerprint", () => {
    expect(
      repairLegacyMindMapConfig({
        maxNodeImageStorageBytes: 8388608,
        outerFramePaddingX: 20,
      }),
    ).toEqual({ outerFramePaddingX: 20 });
  });
});

describe("MindMapAdapter config hygiene", () => {
  const root = { data: { text: "<p>主题</p>" }, children: [] };

  it("repairs polluted config on migrate (editor and embed load path)", () => {
    const migrated = MindMapAdapter.migrate(
      {
        root,
        layout: "logicalStructure",
        config: {
          maxNodeImageStorageBytes: 8388608,
          outerFramePaddingX: 0,
          outerFramePaddingY: 0,
        },
      },
      1,
    );
    expect(migrated.config).toBeUndefined();
  });

  it("compacts config on toDocument (every persistence path)", () => {
    const document = MindMapAdapter.toDocument({
      root,
      layout: "logicalStructure",
      config: {
        maxNodeImageStorageBytes: 8388608,
        outerFramePaddingX: OUTER_FRAME_PADDING_DEFAULT,
        outerFramePaddingY: 14,
      },
    });
    expect(document.data.config).toEqual({ outerFramePaddingY: 14 });
  });
});

describe("runtime config key contract", () => {
  it("covers every key injected by applyMindMapMediaLimitsToConfig", () => {
    const injectedKeys = Object.keys(applyMindMapMediaLimitsToConfig({}));
    expect(injectedKeys.length).toBeGreaterThan(0);
    injectedKeys.forEach((key) => {
      expect(isMindMapRuntimeConfigKey(key)).toBe(true);
    });
  });

  it("matches the outer frame padding default in native defaultOptions.js", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../editors/mindmap/native/simple-mind-map/src/constants/defaultOptions.js",
      ),
      "utf8",
    );
    expect(source).toMatch(
      new RegExp(`outerFramePaddingX:\\s*${OUTER_FRAME_PADDING_DEFAULT},`),
    );
    expect(source).toMatch(
      new RegExp(`outerFramePaddingY:\\s*${OUTER_FRAME_PADDING_DEFAULT},`),
    );
  });
});
