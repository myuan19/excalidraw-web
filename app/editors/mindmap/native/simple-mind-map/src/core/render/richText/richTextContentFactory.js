import { G } from '@svgdotjs/svg.js'
import {
  addXmlns,
  camelCaseToHyphen,
  createForeignObjectNode
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
  let { width, height } = measuredEl.getBoundingClientRect()
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
