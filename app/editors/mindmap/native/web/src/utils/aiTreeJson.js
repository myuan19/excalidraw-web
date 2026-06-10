import { createAiOperationPermissionError } from './aiOperationPolicy'

function extractJsonText(raw) {
  let jsonText = raw
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim()
  }
  if (!jsonText.startsWith('{')) {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start !== -1 && end > start) {
      jsonText = jsonText.slice(start, end + 1)
    }
  }
  return jsonText
}

const VALID_ALIGN = new Set(['left', 'center', 'right'])
const VALID_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const VALID_SIZE = /^\d{1,3}px$/
const MAX_INDENT = 8
const NAMED_COLOR_MAP = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#fff2cc',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  pink: '#ffc0cb'
}

const escapeHtml = value => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const escapeHtmlText = value => {
  return escapeHtml(value)
    .replace(/\t/g, '    ')
    .replace(/^ +/, spaces => '&nbsp;'.repeat(spaces.length))
    .replace(/ {2,}/g, spaces => ` ${'&nbsp;'.repeat(spaces.length - 1)}`)
}

const normalizeBool = value => value === true

const normalizeColor = value => {
  if (typeof value !== 'string') {
    return ''
  }
  const text = value.trim()
  if (VALID_COLOR.test(text)) {
    return text
  }
  return NAMED_COLOR_MAP[text.toLowerCase()] || ''
}

const rgbToHex = value => {
  const match = String(value || '').match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i
  )
  if (!match) {
    return ''
  }
  const toHex = item => {
    const num = Math.max(0, Math.min(255, Number(item) || 0))
    return num.toString(16).padStart(2, '0')
  }
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`
}

const normalizeCssColor = value => {
  const text = String(value || '').trim()
  if (!text || text === 'transparent') {
    return ''
  }
  if (VALID_COLOR.test(text)) {
    return text
  }
  if (NAMED_COLOR_MAP[text.toLowerCase()]) {
    return NAMED_COLOR_MAP[text.toLowerCase()]
  }
  return rgbToHex(text)
}

const normalizeSize = value => {
  return typeof value === 'string' && VALID_SIZE.test(value.trim())
    ? value.trim()
    : ''
}

const normalizeIndent = value => {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return 0
  }
  return Math.max(0, Math.min(MAX_INDENT, Math.floor(num)))
}

const normalizeText = value => {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

const stripHtmlTagsFromText = value => {
  return normalizeText(value)
    .replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '')
    .replace(/&lt;\/?[a-z][a-z0-9]*(?:\s+[^&]*?)?&gt;/gi, '')
}

const decodeHtmlTextEntities = value => {
  return normalizeText(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

const normalizeAiSpanText = (value, options = {}) => {
  const text = decodeHtmlTextEntities(stripHtmlTagsFromText(value))
  return options.preserveLeadingSpaces ? text : text.replace(/^\s+/, '')
}

function normalizeSpan(span, options = {}) {
  if (!span || typeof span !== 'object' || Array.isArray(span)) {
    return {
      text: normalizeAiSpanText(span, options)
    }
  }
  const formula = normalizeText(span.formula).trim()
  const text = formula ? `$${formula}$` : normalizeAiSpanText(span.text, options)
  const result = {
    text
  }
  if (options.allowInlineStyles) {
    result.bold = normalizeBool(span.bold)
    result.italic = normalizeBool(span.italic)
    result.underline = normalizeBool(span.underline)
    result.strike = normalizeBool(span.strike)
    result.color = normalizeColor(span.color)
    result.background = normalizeColor(span.background)
    result.font = typeof span.font === 'string' ? span.font.trim() : ''
    result.size = normalizeSize(span.size)
  }
  return result
}

function normalizeParagraph(paragraph, options = {}) {
  if (!paragraph || typeof paragraph !== 'object' || Array.isArray(paragraph)) {
    return {
      align: '',
      indent: 0,
      spans: [normalizeSpan(paragraph, options)]
    }
  }
  const spans = Array.isArray(paragraph.spans)
    ? paragraph.spans
        .map(span => normalizeSpan(span, options))
        .filter(span => span.text)
    : [normalizeSpan(paragraph.text || paragraph.formula || '', options)].filter(
        span => span.text
      )
  return {
    align:
      options.allowInlineStyles && VALID_ALIGN.has(paragraph.align)
        ? paragraph.align
        : '',
    indent: options.allowInlineStyles ? normalizeIndent(paragraph.indent) : 0,
    spans
  }
}

function splitParagraphByNewlines(paragraph) {
  const result = [
    {
      align: paragraph.align,
      indent: paragraph.indent,
      spans: []
    }
  ]
  paragraph.spans.forEach(span => {
    const parts = String(span.text || '').split(/\n/)
    parts.forEach((part, index) => {
      if (index > 0) {
        result.push({
          align: paragraph.align,
          indent: paragraph.indent,
          spans: []
        })
      }
      if (part) {
        result[result.length - 1].spans.push({
          ...span,
          text: part
        })
      }
    })
  })
  return result
}

function normalizeRichText(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const text = normalizeText(input)
    if (!text) {
      return { paragraphs: [] }
    }
    return {
      paragraphs: text
        .split(/\n+/)
        .map(line => ({
          align: '',
          indent: 0,
          spans: [normalizeSpan({ text: line }, options)]
        }))
        .filter(paragraph => paragraph.spans.length > 0)
    }
  }
  if (Array.isArray(input.paragraphs)) {
    return {
      paragraphs: input.paragraphs
        .map(paragraph => normalizeParagraph(paragraph, options))
        .reduce((list, paragraph) => {
          return [...list, ...splitParagraphByNewlines(paragraph)]
        }, [])
        .filter(paragraph => paragraph.spans.length > 0)
    }
  }
  return normalizeRichText(input.text || '', options)
}

function getElementAlign(element) {
  if (!element || element.nodeType !== 1) {
    return ''
  }
  const className = element.getAttribute('class') || ''
  const classMatch = className.match(/ql-align-(center|right|left)/)
  if (classMatch) {
    return classMatch[1]
  }
  const textAlign = element.style && element.style.textAlign
  return VALID_ALIGN.has(textAlign) ? textAlign : ''
}

function getElementIndent(element) {
  if (!element || element.nodeType !== 1) {
    return 0
  }
  const className = element.getAttribute('class') || ''
  const classMatch = className.match(/ql-indent-(\d+)/)
  return classMatch ? normalizeIndent(classMatch[1]) : 0
}

function createSpanFromText(text, style) {
  const span = {
    text
  }
  if (style.bold) span.bold = true
  if (style.italic) span.italic = true
  if (style.underline) span.underline = true
  if (style.strike) span.strike = true
  if (style.color) span.color = style.color
  if (style.background) span.background = style.background
  if (style.font) span.font = style.font
  if (style.size) span.size = style.size
  return span
}

function getElementInlineStyle(element, inheritedStyle = {}) {
  const style = {
    ...inheritedStyle
  }
  if (!element || element.nodeType !== 1) {
    return style
  }
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'strong' || tagName === 'b') style.bold = true
  if (tagName === 'em' || tagName === 'i') style.italic = true
  if (tagName === 'u') style.underline = true
  if (tagName === 'mark') {
    style.background = style.background || '#fff2cc'
  }
  if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
    style.strike = true
  }
  const inlineStyle = element.style || {}
  const color = normalizeCssColor(inlineStyle.color)
  const background = normalizeCssColor(
    inlineStyle.backgroundColor || inlineStyle.background
  )
  const font = inlineStyle.fontFamily
    ? inlineStyle.fontFamily.replace(/['"]/g, '').trim()
    : ''
  const size = normalizeSize(inlineStyle.fontSize)
  if (color) style.color = color
  if (background) style.background = background
  if (font) style.font = font
  if (size) style.size = size
  return style
}

function appendNodeRichText(node, inheritedStyle, spans) {
  if (node.nodeType === 3) {
    const text = node.nodeValue || ''
    if (text) {
      spans.push(createSpanFromText(text, inheritedStyle))
    }
    return
  }
  if (node.nodeType !== 1) {
    return
  }
  const element = node
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'br') {
    spans.push(createSpanFromText('\n', inheritedStyle))
    return
  }
  const style = getElementInlineStyle(element, inheritedStyle)
  Array.from(element.childNodes).forEach(child => {
    appendNodeRichText(child, style, spans)
  })
}

function isBlockElement(element) {
  if (!element || element.nodeType !== 1) {
    return false
  }
  return ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
    element.tagName.toLowerCase()
  )
}

export function quillHtmlToRichTextJson(html, options = {}) {
  if (typeof document === 'undefined') {
    return normalizeRichText(String(html || ''), options)
  }
  const container = document.createElement('div')
  container.innerHTML = String(html || '')
  const children = Array.from(container.children)
  const blocks = children.filter(isBlockElement)
  const sourceBlocks = blocks.length > 0 ? blocks : [container]
  const paragraphs = sourceBlocks
    .map(block => {
      const spans = []
      Array.from(block.childNodes).forEach(child => {
        appendNodeRichText(child, {}, spans)
      })
      return {
        align: getElementAlign(block),
        indent: getElementIndent(block),
        spans: spans.filter(span => span.text)
      }
    })
    .reduce((list, paragraph) => {
      return [...list, ...splitParagraphByNewlines(paragraph)]
    }, [])
    .filter(paragraph => paragraph.spans.length > 0)
  return {
    paragraphs
  }
}

export function summarizeRichTextJson(richText) {
  const spanStyleKeys = [
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'font',
    'size'
  ]
  const summary = {
    paragraphCount: 0,
    spanCount: 0,
    styledSpanCount: 0,
    indentParagraphCount: 0,
    alignedParagraphCount: 0,
    leadingSpaceSpanCount: 0,
    multiSpaceSpanCount: 0,
    newlineSpanCount: 0,
    maxIndent: 0,
    styleKeys: []
  }
  const styleKeys = new Set()
  const paragraphs =
    richText && Array.isArray(richText.paragraphs) ? richText.paragraphs : []
  summary.paragraphCount = paragraphs.length
  paragraphs.forEach(paragraph => {
    const indent = normalizeIndent(paragraph.indent)
    if (indent > 0) {
      summary.indentParagraphCount += 1
      summary.maxIndent = Math.max(summary.maxIndent, indent)
    }
    if (paragraph.align) {
      summary.alignedParagraphCount += 1
      styleKeys.add('align')
    }
    const spans = Array.isArray(paragraph.spans) ? paragraph.spans : []
    summary.spanCount += spans.length
    spans.forEach(span => {
      const text = String(span.text || '')
      if (/^\s+/.test(text)) summary.leadingSpaceSpanCount += 1
      if (/ {2,}/.test(text)) summary.multiSpaceSpanCount += 1
      if (/\n/.test(text)) summary.newlineSpanCount += 1
      spanStyleKeys.forEach(key => {
        if (span[key]) {
          styleKeys.add(key)
        }
      })
      if (
        span.bold ||
        span.italic ||
        span.underline ||
        span.strike ||
        span.color ||
        span.background ||
        span.font ||
        span.size
      ) {
        summary.styledSpanCount += 1
      }
    })
  })
  summary.styleKeys = Array.from(styleKeys).sort()
  return summary
}

function spanToHtml(span) {
  const style = []
  if (span.color) style.push(`color:${span.color}`)
  if (span.background) style.push(`background-color:${span.background}`)
  if (span.font) style.push(`font-family:${escapeHtml(span.font)}`)
  if (span.size) style.push(`font-size:${span.size}`)
  let html = `<span${style.length ? ` style="${style.join(';')};"` : ''}>${escapeHtmlText(
    span.text
  )}</span>`
  if (span.bold) html = `<strong>${html}</strong>`
  if (span.italic) html = `<em>${html}</em>`
  if (span.underline) html = `<u>${html}</u>`
  if (span.strike) html = `<s>${html}</s>`
  return html
}

export function richTextJsonToQuillHtml(input, options = {}) {
  const richText = normalizeRichText(input, options)
  if (!richText.paragraphs.length) {
    return '<p><br></p>'
  }
  return richText.paragraphs
    .map(paragraph => {
      const classNames = []
      if (paragraph.align && paragraph.align !== 'left') {
        classNames.push(`ql-align-${paragraph.align}`)
      }
      if (paragraph.indent) {
        classNames.push(`ql-indent-${paragraph.indent}`)
      }
      const className = classNames.length
        ? ` class="${classNames.join(' ')}"`
        : ''
      const content = paragraph.spans.map(spanToHtml).join('') || '<br>'
      return `<p${className}>${content}</p>`
    })
    .join('')
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeSmmDataNodeToAiInput(dataNode) {
  if (!dataNode || typeof dataNode !== 'object' || !dataNode.data) {
    throw new Error('invalid simpleMindMap node')
  }
  const data = dataNode.data || {}
  const input = data.richText
    ? quillHtmlToRichTextJson(data.text || '')
    : {
        text: data.text || ''
      }
  const note = normalizeOptionalText(data.note)
  const hyperlink = normalizeOptionalText(data.hyperlink)
  if (note) input.note = note
  if (hyperlink) input.hyperlink = hyperlink
  const children = Array.isArray(dataNode.children) ? dataNode.children : []
  if (children.length > 0) {
    input.children = children.map(child => normalizeSmmDataNodeToAiInput(child))
  }
  return input
}

export function normalizeAiOrganizeNode(input, allowChildren, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid ai organize node')
  }
  const data = {
    text: richTextJsonToQuillHtml(input, options),
    richText: true
  }
  const note = normalizeOptionalText(input.note)
  const hyperlink = normalizeOptionalText(input.hyperlink)
  if (note) data.note = note
  if (hyperlink) data.hyperlink = hyperlink
  const children =
    allowChildren && Array.isArray(input.children)
      ? input.children.map(child =>
          normalizeAiOrganizeNode(child, true, options)
        )
      : []
  return {
    data,
    children
  }
}

export function parseAiSimpleMindMapJson(
  parsed,
  {
    allowChildren = false,
    allowInlineStyles = false,
    preserveLeadingSpaces = false
  } = {}
) {
  if (!parsed || typeof parsed !== 'object' || !parsed.simpleMindMap) {
    throw new Error('invalid simpleMindMap json')
  }
  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
  const currentNode = list.find(item => item && item.data)
  if (!currentNode) {
    throw new Error('empty simpleMindMap data')
  }
  const options = { allowInlineStyles, preserveLeadingSpaces }
  const current = normalizeAiOrganizeNode(
    normalizeSmmDataNodeToAiInput(currentNode),
    false,
    options
  )
  const extraTopLevelNodes = list.filter(item => item && item !== currentNode)
  const nestedChildren = Array.isArray(currentNode.children)
    ? currentNode.children
    : []
  const children = allowChildren
    ? [...nestedChildren, ...extraTopLevelNodes].map(child =>
        normalizeAiOrganizeNode(normalizeSmmDataNodeToAiInput(child), true, options)
      )
    : []
  return {
    current,
    children
  }
}

export function parseAiOrganizeJson(
  content,
  {
    allowChildren = false,
    allowInlineStyles = false,
    preserveLeadingSpaces = false
  } = {}
) {
  const raw = String(content || '').trim()
  if (!raw) {
    throw new Error('empty ai organize content')
  }
  const parsed = JSON.parse(extractJsonText(raw))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid ai organize json')
  }
  if (!parsed.current || typeof parsed.current !== 'object') {
    throw new Error('invalid ai organize current')
  }
  if (!allowChildren && Array.isArray(parsed.children) && parsed.children.length > 0) {
    throw createAiOperationPermissionError({
      op: 'children'
    })
  }
  const options = { allowInlineStyles, preserveLeadingSpaces }
  const current = normalizeAiOrganizeNode(parsed.current, false, options)
  const children =
    allowChildren && Array.isArray(parsed.children)
      ? parsed.children.map(child =>
          normalizeAiOrganizeNode(child, true, options)
        )
      : []
  return {
    current,
    children
  }
}

export function parseAiFinalOrganizeResult(content, options = {}) {
  const raw = String(content || '').trim()
  if (!raw) {
    throw new Error('empty ai organize content')
  }
  const parsed = JSON.parse(extractJsonText(raw))
  if (parsed && typeof parsed === 'object' && parsed.simpleMindMap) {
    return parseAiSimpleMindMapJson(parsed, options)
  }
  return parseAiOrganizeJson(raw, options)
}
