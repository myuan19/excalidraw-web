import { markdownToHtml } from './markdownPaste'
import { debugMindMap, summarizeHtml, summarizeMarkdown } from '../../utils/mindMapDebug'

let renderCacheNormalizer = html => html

export const setMarkdownRenderCacheNormalizer = normalizer => {
  renderCacheNormalizer =
    typeof normalizer === 'function' ? normalizer : html => html
}

const createHtmlContainer = html => {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return container
}

const normalizeMarkdown = markdown => {
  return String(markdown || '').replace(/\n{3,}/g, '\n\n').trim()
}

const escapeMarkdownText = text => {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

const inlineToMarkdown = node => {
  if (!node) {
    return ''
  }
  if (node.nodeType === 3) {
    return node.nodeValue || ''
  }
  if (node.nodeType !== 1) {
    return ''
  }
  const tag = node.tagName.toLowerCase()
  if (tag === 'br') {
    return '\n'
  }
  if (node.classList.contains('ql-formula')) {
    const value = node.getAttribute('data-value') || node.textContent || ''
    return `$${value}$`
  }
  const content = Array.from(node.childNodes).map(inlineToMarkdown).join('')
  if (tag === 'strong' || tag === 'b') {
    return `**${content}**`
  }
  if (tag === 'em' || tag === 'i') {
    return `*${content}*`
  }
  if (tag === 's' || tag === 'del') {
    return `~~${content}~~`
  }
  if (tag === 'code') {
    return `\`${content}\``
  }
  if (tag === 'mark') {
    return `==${content}==`
  }
  if (tag === 'span' && node.style && node.style.background) {
    return `==${content}==`
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') || ''
    return href ? `[${content}](${href})` : content
  }
  if (tag === 'img') {
    const alt = node.getAttribute('alt') || ''
    const src = node.getAttribute('src') || ''
    return src ? `![${alt}](${src})` : ''
  }
  return content
}

const childrenInlineToMarkdown = node => {
  return escapeMarkdownText(Array.from(node.childNodes).map(inlineToMarkdown).join(''))
}

const cellToMarkdown = cell => {
  const inner = cell.querySelector('.table-up-cell-inner')
  return childrenInlineToMarkdown(inner || cell)
}

const getQuillIndent = node => {
  const className = node.getAttribute('class') || ''
  const match = className.match(/ql-indent-(\d+)/)
  return match ? Number(match[1]) : 0
}

const listToMarkdown = node => {
  const parentOrdered = node.tagName.toLowerCase() === 'ol'
  let orderedIndex = 1
  return Array.from(node.children)
    .filter(child => child.tagName && child.tagName.toLowerCase() === 'li')
    .map(li => {
      const listType = li.getAttribute('data-list')
      const indent = '  '.repeat(getQuillIndent(li))
      const text = childrenInlineToMarkdown(li).replace(/^\s+/, '')
      if (listType === 'checked' || listType === 'unchecked') {
        return `${indent}- [${listType === 'checked' ? 'x' : ' '}] ${text}`
      }
      if (listType === 'bullet') {
        return `${indent}- ${text}`
      }
      const ordered = parentOrdered || listType === 'ordered'
      const prefix = ordered ? `${orderedIndex++}.` : '-'
      return `${indent}${prefix} ${text}`
    })
    .join('\n')
}

const tableToMarkdown = table => {
  const rows = Array.from(table.querySelectorAll('tr')).map(row => {
    return Array.from(row.children).map(cellToMarkdown)
  })
  if (!rows.length) {
    return ''
  }
  const header = rows[0]
  const separator = header.map(() => '-')
  return [header, separator, ...rows.slice(1)]
    .map(row => `| ${row.join(' | ')} |`)
    .join('\n')
}

const quillCodeBlockToMarkdown = node => {
  const lines = Array.from(node.querySelectorAll('.ql-code-block'))
  if (!lines.length) {
    return `\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\``
  }
  const language = lines[0].getAttribute('data-language') || ''
  const code = lines.map(line => line.textContent || '').join('\n')
  return `\`\`\`${language}\n${code}\n\`\`\``
}

const blockToMarkdown = node => {
  if (node.nodeType === 3) {
    return escapeMarkdownText(node.nodeValue)
  }
  if (node.nodeType !== 1) {
    return ''
  }
  const tag = node.tagName.toLowerCase()
  if (node.classList.contains('ql-code-block-container')) {
    return quillCodeBlockToMarkdown(node)
  }
  if (node.classList.contains('table-up-container')) {
    const table = node.querySelector('table')
    return table ? tableToMarkdown(table) : childrenInlineToMarkdown(node)
  }
  if (/^h[1-6]$/.test(tag)) {
    return `${'#'.repeat(Number(tag.slice(1)))} ${childrenInlineToMarkdown(node)}`
  }
  if (tag === 'p') {
    return childrenInlineToMarkdown(node)
  }
  if (tag === 'blockquote') {
    return childrenInlineToMarkdown(node)
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n')
  }
  if (tag === 'pre') {
    return `\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\``
  }
  if (tag === 'ol' || tag === 'ul') {
    return listToMarkdown(node)
  }
  if (tag === 'table') {
    return tableToMarkdown(node)
  }
  if (tag === 'hr') {
    return '---'
  }
  if (node.classList.contains('ql-formula')) {
    const value = node.getAttribute('data-value') || node.textContent || ''
    return node.getAttribute('data-formula-block') === 'true'
      ? `$$\n${value}\n$$`
      : `$${value}$`
  }
  return childrenInlineToMarkdown(node)
}

export const markdownToRenderHtml = markdown => {
  const html = markdownToHtml(markdown)
  debugMindMap('mindmap-markdown', 'markdownToRenderHtml done', {
    markdown: summarizeMarkdown(markdown),
    html: summarizeHtml(html)
  })
  return html
}

export const createMarkdownRenderCache = markdown => {
  const html = markdownToRenderHtml(markdown)
  const normalizedHtml = renderCacheNormalizer(html)
  debugMindMap('mindmap-markdown', 'createMarkdownRenderCache done', {
    markdown: summarizeMarkdown(markdown),
    html: summarizeHtml(html),
    normalizedHtml: summarizeHtml(normalizedHtml)
  })
  return normalizedHtml
}

export const resolveMarkdownNodeHtml = ({
  markdown,
  html,
  fallback = ''
} = {}) => {
  const decision = typeof markdown === 'string'
    ? (typeof html === 'string' ? 'useHtmlCache' : 'rebuildFromMarkdown')
    : (typeof html === 'string' ? 'legacyHtml' : 'fallback')
  debugMindMap('mindmap-markdown', 'resolveMarkdownNodeHtml decision', {
    hasMarkdown: typeof markdown === 'string',
    hasHtmlCache: typeof html === 'string',
    html: summarizeHtml(html),
    markdown: summarizeMarkdown(markdown),
    decision
  })
  if (typeof markdown === 'string') {
    return typeof html === 'string' ? html : createMarkdownRenderCache(markdown)
  }
  if (typeof html === 'string') {
    return html
  }
  return fallback
}

export const resolveNodeRenderHtml = (node, specifyText) => {
  if (typeof specifyText === 'string') {
    return specifyText
  }
  return resolveMarkdownNodeHtml({
    markdown: node && node.getData ? node.getData('markdown') : undefined,
    html: node && node.getData ? node.getData('text') : undefined
  })
}

export const createMarkdownNodeData = ({ markdown, html, richText = true }) => {
  const data = {
    markdown,
    text: html,
    richText
  }
  if (typeof markdown !== 'string') {
    delete data.markdown
  }
  return data
}

export const createMarkdownNodeDataFromHtml = ({
  html,
  markdown,
  richText = true
}) => {
  return createMarkdownNodeData({
    markdown: typeof markdown === 'string' ? markdown : htmlToMarkdown(html),
    html,
    richText
  })
}

export const htmlToMarkdown = html => {
  const container = createHtmlContainer(html)
  const blocks = Array.from(container.childNodes)
    .map(blockToMarkdown)
    .filter(Boolean)
  const markdown = normalizeMarkdown(blocks.join('\n\n'))
  debugMindMap('mindmap-markdown', 'htmlToMarkdown done', {
    html: summarizeHtml(html),
    blockCount: blocks.length,
    markdown: summarizeMarkdown(markdown)
  })
  return markdown
}

