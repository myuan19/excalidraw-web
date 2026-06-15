/** 富文本容器主题字重标记，供 CSS 区分 inherit / explicit bold */
export const RICH_TEXT_THEME_WEIGHT_ATTR = 'data-theme-weight'

export const RICH_TEXT_THEME_WEIGHT = {
  BOLD: 'bold',
  NORMAL: 'normal'
}

/**
 * 将节点主题 fontWeight 规范为 bold | normal。
 * 富文本行内 <strong> 的渲染策略依赖该标记，避免主题粗体与语义粗体叠成「重影」。
 */
export function normalizeRichTextThemeWeight(fontWeight) {
  if (
    fontWeight === 'bold' ||
    fontWeight === 700 ||
    fontWeight === '700' ||
    (typeof fontWeight === 'number' && fontWeight >= 600)
  ) {
    return RICH_TEXT_THEME_WEIGHT.BOLD
  }
  return RICH_TEXT_THEME_WEIGHT.NORMAL
}

export function applyRichTextThemeWeightMarker(el, fontWeight) {
  if (!el || typeof el.setAttribute !== 'function') {
    return
  }
  el.setAttribute(
    RICH_TEXT_THEME_WEIGHT_ATTR,
    normalizeRichTextThemeWeight(fontWeight)
  )
}

/**
 * 主题粗体容器内 <strong> 默认会再合成 bolder，产生加粗重影。
 * - 主题已粗体：strong 继承容器字重
 * - 主题 normal：strong 显式 bold
 */
export const RICH_TEXT_SEMANTIC_BOLD_CSS = `
  .smm-richtext-node-wrap,
  .smm-richtext-node-edit-wrap,
  .smm-richtext-node-edit-wrap .ql-editor {
    font-synthesis: none;
  }

  .smm-richtext-node-wrap strong,
  .smm-richtext-node-wrap b,
  .smm-richtext-node-edit-wrap strong,
  .smm-richtext-node-edit-wrap b,
  .smm-richtext-node-edit-wrap .ql-editor strong,
  .smm-richtext-node-edit-wrap .ql-editor b {
    font-weight: inherit;
  }

  .smm-richtext-node-wrap[${RICH_TEXT_THEME_WEIGHT_ATTR}="normal"] strong,
  .smm-richtext-node-wrap[${RICH_TEXT_THEME_WEIGHT_ATTR}="normal"] b,
  .smm-richtext-node-edit-wrap[${RICH_TEXT_THEME_WEIGHT_ATTR}="normal"] strong,
  .smm-richtext-node-edit-wrap[${RICH_TEXT_THEME_WEIGHT_ATTR}="normal"] b,
  .smm-richtext-node-edit-wrap[${RICH_TEXT_THEME_WEIGHT_ATTR}="normal"] .ql-editor strong,
  .smm-richtext-node-edit-wrap[${RICH_TEXT_THEME_WEIGHT_ATTR}="normal"] .ql-editor b {
    font-weight: bold;
  }
`
