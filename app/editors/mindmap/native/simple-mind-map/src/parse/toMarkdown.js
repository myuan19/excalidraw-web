import { walk, nodeRichTextToTextWithWrap } from '../utils'

const getNodeText = data => {
  if (typeof data.markdown === 'string' && data.markdown.trim()) {
    return data.markdown
  }
  return data.richText ? nodeRichTextToTextWithWrap(data.text) : data.text
}

const getTitleMark = level => {
  return new Array(level).fill('#').join('')
}

const getIndentMark = level => {
  return new Array(level - 6).fill('   ').join('') + '*'
}

export const transformToMarkdown = root => {
  let content = ''
  walk(
    root,
    null,
    (node, parent, isRoot, layerIndex) => {
      const level = layerIndex + 1
      const text = getNodeText(node.data)
      const lines = (text || '').split('\n')
      const firstLine = lines[0] || ''
      const restLines = lines.slice(1)

      if (level <= 6) {
        content += getTitleMark(level) + ' ' + firstLine
      } else {
        content += getIndentMark(level) + ' ' + firstLine
      }

      if (restLines.length > 0) {
        const indent = level <= 6 ? '' : '  '.repeat(level - 6 + 1)
        content += '\n' + restLines.map(line => indent + line).join('\n')
      }

      const generalization = node.data.generalization
      if (Array.isArray(generalization)) {
        content += generalization.map(item => {
          return ` [${getNodeText(item)}]`
        })
      } else if (generalization && generalization.text) {
        const generalizationText = getNodeText(generalization)
        content += ` [${generalizationText}]`
      }
      content += '\n\n'
      if (node.data.note) {
        content += node.data.note + '\n\n'
      }
    },
    () => {},
    true
  )
  return content
}
