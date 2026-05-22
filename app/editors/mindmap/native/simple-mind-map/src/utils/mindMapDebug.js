const DEBUG_STORAGE_KEY = 'mindmapDebug'
const DEBUG_VERBOSE_STORAGE_KEY = 'mindmapDebugVerbose'

export const isMindMapDebugEnabled = () => {
  if (typeof window === 'undefined') {
    return false
  }
  if (window.__MINDMAP_DEBUG__ === true) {
    return true
  }
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mindmapDebug') === '1') {
      return true
    }
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch (error) {
    return false
  }
}

export const isMindMapDebugVerboseEnabled = () => {
  if (!isMindMapDebugEnabled()) {
    return false
  }
  if (typeof window === 'undefined') {
    return false
  }
  if (window.__MINDMAP_DEBUG_VERBOSE__ === true) {
    return true
  }
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mindmapDebugVerbose') === '1') {
      return true
    }
    return window.localStorage.getItem(DEBUG_VERBOSE_STORAGE_KEY) === '1'
  } catch (error) {
    return false
  }
}

const createDebugPayload = data => {
  return {
    t: Math.round(performance.now()),
    ...data
  }
}

const stringifyDebugPayload = payload => {
  try {
    return JSON.stringify(payload)
  } catch (error) {
    return JSON.stringify({
      t: payload.t,
      stringifyError: error && error.message ? error.message : String(error)
    })
  }
}

export const debugMindMap = (scope, label, data = {}, options = {}) => {
  if (!isMindMapDebugEnabled()) {
    return
  }
  if (options.verbose && !isMindMapDebugVerboseEnabled()) {
    return
  }
  const payload = createDebugPayload(data)
  console.log(`[DEBUG] ${scope} | ${label} ${stringifyDebugPayload(payload)}`)
}

export const debugMindMapWarn = (scope, label, data = {}, options = {}) => {
  if (!isMindMapDebugEnabled()) {
    return
  }
  if (options.verbose && !isMindMapDebugVerboseEnabled()) {
    return
  }
  const payload = createDebugPayload(data)
  console.warn(`[DEBUG] ${scope} | ${label} ${stringifyDebugPayload(payload)}`)
}

export const summarizeHtml = html => {
  const text = String(html || '')
  const imageCount = (text.match(/<img\b/gi) || []).length
  const imageWithSrcCount = (text.match(/<img\b[^>]*\ssrc=/gi) || []).length
  return {
    length: text.length,
    preview: text.replace(/\s+/g, ' ').slice(0, 240),
    isBlank: text.replace(/<[^>]*>/g, '').trim().length === 0 && imageCount === 0,
    imageCount,
    imageWithSrcCount,
    hasFormula: text.includes('ql-formula'),
    hasTable: /<table|table-up/i.test(text),
    hasMark: /<mark|background/i.test(text),
    hasHr: /<hr/i.test(text),
    hasCheckbox: /checkbox|data-list="(?:checked|unchecked)"/i.test(text)
  }
}

export const summarizeMarkdown = markdown => {
  const text = String(markdown || '')
  return {
    length: text.length,
    preview: text.replace(/\s+/g, ' ').slice(0, 240),
    hasHeading: /^#{1,6}\s+\S/m.test(text),
    hasList: /^(\s*)([-*+]|\d+\.)\s+\S/m.test(text),
    hasTaskList: /^[-*+]\s+\[[ xX]\]\s+\S/m.test(text),
    hasBlockquote: /^>\s+\S/m.test(text),
    hasCodeBlock: /^```[\s\S]*```/m.test(text),
    hasTable: /^\|.+\|\s*$/m.test(text),
    hasFormula: /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/m.test(text),
    hasImage: /!\[[^\]\n]*?\]\([^)]+?\)/m.test(text),
    hasHr: /^-{3,}\s*$/m.test(text),
    lineCount: text ? text.split(/\r\n|\r|\n/).length : 0
  }
}

export const summarizeNodeForDebug = node => {
  if (!node) {
    return null
  }
  return {
    uid: node.uid || null,
    richText: !!node.getData?.('richText'),
    hasMarkdown: typeof node.getData?.('markdown') === 'string',
    isRoot: !!node.isRoot,
    customWidth: typeof node.hasCustomWidth === 'function' && node.hasCustomWidth(),
    width: node.width || null,
    height: node.height || null
  }
}
