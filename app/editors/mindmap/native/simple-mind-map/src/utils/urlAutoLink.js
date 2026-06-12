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

/** 命中富文本容器内的链接元素，否则返回 null */
function findRichTextAnchor(target) {
  const anchor =
    target && target.closest ? target.closest('a[href]') : null
  if (!anchor || !anchor.closest(RICH_TEXT_CONTAINER_SELECTOR)) {
    return null
  }
  return anchor
}

/** mousedown 与 mouseup 间允许的指针位移（px），超过视为拖拽不打开 */
const LINK_CLICK_MOVE_TOLERANCE = 4

/**
 * 富文本链接统一交互：任何状态（展示/文本编辑/只读嵌入）都仅 Ctrl/Cmd+单击打开，
 * 普通点击与普通文本无差异（事件照常冒泡：节点选中、双击进编辑不受影响）。
 *
 * 用 mousedown 记录 + mouseup 完成，而非 click：展示态下 mousedown 激活节点
 * 触发重渲染，富文本 DOM 被整体替换，click 的 target 不再是 <a>，单击会失效
 * （双击时第二次按下节点已激活才侥幸命中）。mousedown 时 DOM 尚未替换，可靠。
 *
 * 绑定在 document 捕获阶段：文本编辑框挂在 body 下且自身 stopPropagation，
 * 绑容器元素会漏掉编辑态的链接。
 */
export function bindRichTextLinkClicks() {
  if (document.__smmRichTextLinkBound) {
    return
  }
  bindLinkModifierStateClass()
  let pendingLink = null
  document.addEventListener(
    'mousedown',
    event => {
      pendingLink = null
      if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) {
        return
      }
      const anchor = findRichTextAnchor(event.target)
      if (!anchor) {
        return
      }
      pendingLink = {
        href: anchor.getAttribute('href') || anchor.href,
        x: event.clientX,
        y: event.clientY
      }
    },
    true
  )
  document.addEventListener(
    'mouseup',
    event => {
      if (!pendingLink) {
        return
      }
      const { href, x, y } = pendingLink
      pendingLink = null
      if (
        !(event.ctrlKey || event.metaKey) ||
        Math.abs(event.clientX - x) > LINK_CLICK_MOVE_TOLERANCE ||
        Math.abs(event.clientY - y) > LINK_CLICK_MOVE_TOLERANCE
      ) {
        return
      }
      openUrlInNewTab(href)
    },
    true
  )
  // 拦截原生 <a> 导航（编辑态 DOM 稳定时 click 仍可能命中锚点），打开行为统一受控
  document.addEventListener(
    'click',
    event => {
      if (findRichTextAnchor(event.target)) {
        event.preventDefault()
      }
    },
    true
  )
  document.__smmRichTextLinkBound = true
}
