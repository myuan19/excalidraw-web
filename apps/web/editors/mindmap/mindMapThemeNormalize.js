/** 与 native Edit.vue / 桥接载荷对齐的主题结构：{ template, config } */
const DEFAULT_TEMPLATE = "classic4";

/**
 * 将文档或桥接中的 theme（字符串或对象）规范为 native 页面使用的结构。
 * @param {unknown} theme
 * @param {string} [fallbackTemplate]
 */
export function normalizeMindMapTheme(
  theme,
  fallbackTemplate = DEFAULT_TEMPLATE,
) {
  if (typeof theme === "string" && theme.trim()) {
    return { template: theme.trim(), config: {} };
  }
  if (theme && typeof theme === "object") {
    const record = /** @type {Record<string, unknown>} */ (theme);
    const template =
      typeof record.template === "string" && record.template.trim()
        ? record.template.trim()
        : fallbackTemplate;
    const config =
      record.config && typeof record.config === "object"
        ? /** @type {Record<string, unknown>} */ (record.config)
        : {};
    return { template, config };
  }
  return { template: fallbackTemplate, config: {} };
}
