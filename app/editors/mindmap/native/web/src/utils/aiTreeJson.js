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

const escapeHtml = value => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const normalizeBool = value => value === true

const normalizeColor = value => {
  return typeof value === 'string' && VALID_COLOR.test(value.trim())
    ? value.trim()
    : ''
}

const normalizeSize = value => {
  return typeof value === 'string' && VALID_SIZE.test(value.trim())
    ? value.trim()
    : ''
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

function normalizeSpan(span, options = {}) {
  if (!span || typeof span !== 'object' || Array.isArray(span)) {
    return {
      text: normalizeText(span)
    }
  }
  const formula = normalizeText(span.formula).trim()
  const text = formula ? `$${formula}$` : normalizeText(span.text)
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
    spans
  }
}

function normalizeRichText(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const text = normalizeText(input).trim()
    return {
      paragraphs: text
        ? text.split(/\n+/).map(line => ({
            align: '',
            spans: [{ text: line }]
          }))
        : []
    }
  }
  if (Array.isArray(input.paragraphs)) {
    return {
      paragraphs: input.paragraphs
        .map(paragraph => normalizeParagraph(paragraph, options))
        .filter(paragraph => {
          return paragraph.spans.length > 0
        })
    }
  }
  return normalizeRichText(input.text || '', options)
}

function spanToHtml(span) {
  const style = []
  if (span.color) style.push(`color:${span.color}`)
  if (span.background) style.push(`background-color:${span.background}`)
  if (span.font) style.push(`font-family:${escapeHtml(span.font)}`)
  if (span.size) style.push(`font-size:${span.size}`)
  let html = `<span${style.length ? ` style="${style.join(';')};"` : ''}>${escapeHtml(
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
      const className =
        paragraph.align && paragraph.align !== 'left'
          ? ` class="ql-align-${paragraph.align}"`
          : ''
      const content = paragraph.spans.map(spanToHtml).join('') || '<br>'
      return `<p${className}>${content}</p>`
    })
    .join('')
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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

export function parseAiOrganizeJson(
  content,
  { allowChildren = false, allowInlineStyles = false } = {}
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
  const options = { allowInlineStyles }
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
