import {
  createMarkdownNodeData,
  createMarkdownRenderCache,
  htmlToMarkdown
} from './markdownStorage'

const normalizeMarkdownSource = markdown => String(markdown || '').trim()

const getFence = markdown => {
  const matches = normalizeMarkdownSource(markdown).match(/`{3,}/g) || []
  const longest = matches.reduce((max, item) => Math.max(max, item.length), 2)
  return '`'.repeat(Math.max(3, longest + 1))
}

export const toMarkdownSourceBlock = markdown => {
  const source = normalizeMarkdownSource(markdown)
  const fence = getFence(source)
  return `${fence}markdown\n${source}\n${fence}`
}

export const appendMarkdownBlockToSource = (currentMarkdown, pastedMarkdown) => {
  const current = normalizeMarkdownSource(currentMarkdown)
  const block = toMarkdownSourceBlock(pastedMarkdown)
  return current ? `${current}\n\n${block}` : block
}

export const createMarkdownClipboardNodeData = markdown => {
  const block = toMarkdownSourceBlock(markdown)
  return createMarkdownNodeData({
    markdown: block,
    html: createMarkdownRenderCache(block)
  })
}

export const isFullQuillSelection = (range, quillLength) => {
  if (!range || range.index !== 0) {
    return false
  }
  return range.length >= Math.max(0, quillLength - 1)
}

export const getClipboardMarkdownFromNode = ({
  pendingMarkdownSource = '',
  node = null,
  html = '',
  selectedHtml = '',
  fullSelection = false
} = {}) => {
  if (!fullSelection) {
    return htmlToMarkdown(selectedHtml)
  }
  if (pendingMarkdownSource) {
    return pendingMarkdownSource
  }
  const storedMarkdown = node && node.getData
    ? node.getData('markdown')
    : undefined
  if (typeof storedMarkdown === 'string') {
    return storedMarkdown
  }
  return htmlToMarkdown(html)
}
