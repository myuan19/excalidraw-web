// 常见 URL 识别与富文本链接化（节点内粘贴/展示）

const URL_BODY_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/gi

const WHOLE_URL_PATTERN = /^(?:https?:\/\/|www\.)[^\s<>"']+$/i

export function normalizeUrl(url) {
  const trimmed = String(url || '').trim()
  if (!trimmed) {
    return ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

export function isWholeUrlText(text) {
  const trimmed = String(text || '').trim()
  return WHOLE_URL_PATTERN.test(trimmed)
}

export function extractFirstUrl(text) {
  const trimmed = String(text || '').trim()
  if (!isWholeUrlText(trimmed)) {
    return null
  }
  return normalizeUrl(trimmed)
}

export function linkifyPlainText(text) {
  return String(text || '').replace(URL_BODY_PATTERN, url => {
    const href = normalizeUrl(url)
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })
}

export function linkifyRichTextHtml(html) {
  const source = String(html || '')
  if (!source || /<a\s/i.test(source)) {
    return source
  }
  return source.replace(/>([^<]+)</g, (_match, text) => {
    return `>${linkifyPlainText(text)}<`
  })
}

export function openUrlInNewTab(url) {
  const href = normalizeUrl(url)
  if (!href) {
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}

/** Ctrl/Cmd 按下时给 html 加状态类，链接 hover 才显示 pointer 光标 */
export const LINK_MODIFIER_ACTIVE_CLASS = 'smm-link-ctrl-down'

/** 节点展示态与文本编辑态的富文本容器，链接交互在两者内行为一致 */
const RICH_TEXT_CONTAINER_SELECTOR =
  '.smm-richtext-node-wrap, .smm-richtext-node-edit-wrap'

function bindLinkModifierStateClass() {
  const html = document.documentElement
  if (html.__smmLinkModifierBound) {
    return
  }
  const setDown = down => html.classList.toggle(LINK_MODIFIER_ACTIVE_CLASS, down)
  window.addEventListener('keydown', event => {
    if (event.key === 'Control' || event.key === 'Meta') setDown(true)
  })
  window.addEventListener('keyup', event => {
    if (event.key === 'Control' || event.key === 'Meta') setDown(false)
  })
  window.addEventListener('blur', () => setDown(false))
  html.__smmLinkModifierBound = true
}

/**
 * 富文本链接统一交互：任何状态（展示/文本编辑/只读嵌入）都仅 Ctrl/Cmd+单击打开，
 * 普通点击与普通文本无差异（事件照常冒泡：节点选中、双击进编辑不受影响）。
 * 绑定在 document 捕获阶段：文本编辑框挂在 body 下且自身 stopPropagation，
 * 绑容器元素会漏掉编辑态的链接。
 */
export function bindRichTextLinkClicks() {
  if (document.__smmRichTextLinkBound) {
    return
  }
  bindLinkModifierStateClass()
  const openFromEvent = event => {
    const anchor = event.target && event.target.closest
      ? event.target.closest('a[href]')
      : null
    if (!anchor || !anchor.closest(RICH_TEXT_CONTAINER_SELECTOR)) {
      return
    }
    // 始终拦截原生 <a> 的导航，打开行为统一受控
    event.preventDefault()
    if (!(event.ctrlKey || event.metaKey)) {
      return
    }
    event.stopPropagation()
    openUrlInNewTab(anchor.getAttribute('href') || anchor.href)
  }
  document.addEventListener('click', openFromEvent, true)
  document.__smmRichTextLinkBound = true
}
