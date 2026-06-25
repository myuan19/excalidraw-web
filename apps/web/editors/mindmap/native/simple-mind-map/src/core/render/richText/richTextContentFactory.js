import { G } from '@svgdotjs/svg.js'
import {
  addXmlns,
  camelCaseToHyphen,
  createForeignObjectNode,
  mindMapDebugLog
} from '../../../utils'
import { applyRichTextThemeWeightMarker } from '../../../constants/richTextFontWeightStyle'

export function computeRichTextFingerprint(text) {
  if (text == null) {
    return '0'
  }
  const source = String(text)
  const strongCount = (source.match(/<strong\b/gi) || []).length
  const paragraphCount = (source.match(/<p\b/gi) || []).length
  return `${source.length}:${strongCount}:${paragraphCount}`
}

function getOrCreateMeasureElement(mindMap) {
  if (!mindMap.commonCaches.measureRichtextNodeTextSizeEl) {
    const div = document.createElement('div')
    div.style.position = 'fixed'
    div.style.left = '-999999px'
    mindMap.commonCaches.measureRichtextNodeTextSizeEl = div
    mindMap.el.appendChild(div)
  }
  return mindMap.commonCaches.measureRichtextNodeTextSizeEl
}

/**
 * 在共享测量池中量尺寸，返回独立 clone，避免后续节点覆写 innerHTML 污染已挂载 DOM。
 */
export function measureRichTextContent({
  mindMap,
  html,
  styleList = [],
  maxWidth,
  customWidth,
  emptyTextMeasureHeightText = '',
  fallbackFontSize = 16
}) {
  const div = getOrCreateMeasureElement(mindMap)
  styleList.forEach(([prop, value]) => {
    div.style[prop] = value
  })
  div.style.lineHeight = 1.2
  div.innerHTML = html
  // 强制同步布局，避免在隐藏 iframe / 离屏测量时读到 0 宽。
  void div.offsetHeight
  const measuredEl = div.children[0]
  if (!measuredEl) {
    return { width: 0, height: 0, contentEl: null, fingerprint: '0' }
  }
  measuredEl.classList.add('smm-richtext-node-wrap')
  measuredEl.style.maxWidth = maxWidth + 'px'
  if (customWidth) {
    measuredEl.style.width = customWidth + 'px'
  } else {
    measuredEl.style.width = ''
  }
  void measuredEl.offsetHeight
  let { width, height } = measuredEl.getBoundingClientRect()
  const plainTextLength = (measuredEl.textContent || '').trim().length
  if (width <= 1 && plainTextLength > 0) {
    // 测量容器瞬时不可见（如祖先 display:none / 布局未刷新）时返回 0 宽，
    // 若直接使用会让 foreignObject 以 1px 宽渲染、节点文本不可见，
    // 直到下一次重渲染才恢复。以字号估算宽度兜底，并留日志定位根因。
    mindMapDebugLog('mindmap-richtext-measure', 'zero width fallback', {
      plainTextLength,
      rawHeight: height,
      connected: !!measuredEl.isConnected
    })
    width = Math.min(plainTextLength * fallbackFontSize, maxWidth)
  }
  if (height <= 1 && plainTextLength > 0) {
    mindMapDebugLog('mindmap-richtext-measure', 'collapsed height fallback', {
      plainTextLength,
      rawHeight: height,
      connected: !!measuredEl.isConnected
    })
    height = Math.ceil(fallbackFontSize * 1.2)
  }
  if (height <= 0) {
    height = Math.ceil(fallbackFontSize * 1.2)
    if (height <= 0 && emptyTextMeasureHeightText) {
      div.innerHTML = `<p>${emptyTextMeasureHeightText}</p>`
      const elTmp = div.children[0]
      if (elTmp) {
        elTmp.classList.add('smm-richtext-node-wrap')
        height = elTmp.getBoundingClientRect().height
      }
      div.innerHTML = html
    }
  }
  width = Math.min(Math.ceil(width) + 1, maxWidth)
  height = Math.ceil(height)
  const plainHtml = measuredEl.innerHTML
  const contentEl = measuredEl.cloneNode(true)
  addXmlns(contentEl)
  return {
    width,
    height,
    contentEl,
    fingerprint: computeRichTextFingerprint(plainHtml)
  }
}

export function buildRichTextNodeGroup({
  contentEl,
  width,
  height,
  styleList = []
}) {
  const g = new G()
  g.attr('data-width', width)
  g.attr('data-height', height)
  const foreignObjectStyle = {
    'line-height': 1.2
  }
  styleList.forEach(([prop, value]) => {
    foreignObjectStyle[camelCaseToHyphen(prop)] = value
  })
  const foreignObject = createForeignObjectNode({
    el: contentEl,
    width,
    height
  })
  foreignObject.css(foreignObjectStyle)
  g.add(foreignObject)
  return {
    node: g,
    nodeContent: foreignObject,
    width,
    height
  }
}
