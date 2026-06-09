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

export function bindRichTextLinkClicks(rootEl) {
  if (!rootEl || rootEl.__smmRichTextLinkBound) {
    return
  }
  const openFromEvent = event => {
    const anchor = event.target && event.target.closest
      ? event.target.closest('.smm-richtext-node-wrap a[href]')
      : null
    if (!anchor || !rootEl.contains(anchor)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    openUrlInNewTab(anchor.getAttribute('href') || anchor.href)
  }
  rootEl.addEventListener('click', openFromEvent, true)
  rootEl.addEventListener('dblclick', openFromEvent, true)
  rootEl.__smmRichTextLinkBound = true
}
