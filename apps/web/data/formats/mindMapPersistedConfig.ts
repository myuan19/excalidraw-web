/**
 * MindMap 文档 `config` 的持久化整理。
 *
 * 背景：宿主每次向 iframe 发送 config 前会注入运行时键（媒体限制、__nbPreview*），
 * 旧版桥接把整份 config 原样回写进文档，导致运行时键泄漏；同时 iframe 的
 * data_change 回写会把当时的 outerFramePaddingX/Y 钉进文档（曾出现非用户意图的 0）。
 *
 * 约定（与主题字段的 compactCustomThemeConfig 一致）：等于默认值的字段不落盘，
 * 默认值只在 native defaultOptions.js 一处维护（由 source 契约测试守护）。
 */

/** 与 native simple-mind-map/src/constants/defaultOptions.js 的 outerFramePaddingX/Y 一致 */
export const OUTER_FRAME_PADDING_DEFAULT = 10;

const OUTER_FRAME_PADDING_KEYS = ["outerFramePaddingX", "outerFramePaddingY"];

/** 宿主 applyMindMapMediaLimitsToConfig 注入的键（一致性由单测守护） */
const MEDIA_LIMIT_CONFIG_KEYS = new Set([
  "maxNodeImageStorageBytes",
  "maxNodeImageStorageWidth",
  "maxNodeImageStorageHeight",
]);

/** 预览/嵌入视口参数前缀（embed.ts、MindMapEditorShell 注入） */
const PREVIEW_CONFIG_KEY_PREFIX = "__nbPreview";

export function isMindMapRuntimeConfigKey(key: string): boolean {
  return (
    MEDIA_LIMIT_CONFIG_KEYS.has(key) || key.startsWith(PREVIEW_CONFIG_KEY_PREFIX)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 关闭且无自定义颜色的彩虹线条配置等价于库默认值（{open:false, colorsList:[]}） */
function isDefaultRainbowLinesConfig(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.open) {
    return false;
  }
  const colors = value.colorsList;
  return colors === undefined || (Array.isArray(colors) && colors.length === 0);
}

function omitConfigEntries(
  config: Record<string, unknown>,
  shouldDrop: (key: string, value: unknown) => boolean,
): Record<string, unknown> | undefined {
  const entries = Object.entries(config).filter(
    ([key, value]) => !shouldDrop(key, value),
  );
  if (entries.length === 0) {
    return undefined;
  }
  if (entries.length === Object.keys(config).length) {
    return config;
  }
  return Object.fromEntries(entries);
}

/**
 * 写边界（toDocument）：剥离运行时键，等于默认值的字段不落盘。
 * 显式非默认值（含用户设置的 0）原样保留。
 */
export function compactMindMapPersistedConfig(
  config: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (!isRecord(config)) {
    return undefined;
  }
  return omitConfigEntries(config, (key, value) => {
    if (isMindMapRuntimeConfigKey(key)) {
      return true;
    }
    if (
      OUTER_FRAME_PADDING_KEYS.includes(key) &&
      value === OUTER_FRAME_PADDING_DEFAULT
    ) {
      return true;
    }
    return key === "rainbowLinesConfig" && isDefaultRainbowLinesConfig(value);
  });
}

/**
 * 读边界（migrate）：修复被旧版「注入→回写」链路污染的 config。
 *
 * 两条修复规则：
 * 1. 泄漏的运行时键是污染指纹——只有被旧链路整圈回写过的 config 才含这些键；
 *    此时的 outerFramePadding 0 来自 bug 而非用户意图，一并删除以回落库默认值。
 * 2. 双轴同时为 0 的 padding 对即使没有指纹也视为遗留污染删除：指纹可能已被
 *    compact（先剥运行时键）销毁而 0 残留。代价是「双轴都显式设 0」无法跨会话
 *    持久化（单轴 0 配非零值仍可保留）；外框完全贴边不是合理样式，可接受。
 */
export function repairLegacyMindMapConfig(
  config: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (!isRecord(config)) {
    return undefined;
  }
  const hasFingerprint = Object.keys(config).some(isMindMapRuntimeConfigKey);
  const bothPaddingsZero = OUTER_FRAME_PADDING_KEYS.every(
    (key) => config[key] === 0,
  );
  if (!hasFingerprint && !bothPaddingsZero) {
    return config;
  }
  return omitConfigEntries(config, (key, value) => {
    if (isMindMapRuntimeConfigKey(key)) {
      return true;
    }
    if (!OUTER_FRAME_PADDING_KEYS.includes(key) || value !== 0) {
      return false;
    }
    return hasFingerprint || bothPaddingsZero;
  });
}
