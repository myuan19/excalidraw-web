import Quill from 'quill'
import { debugMindMap } from '../../utils/mindMapDebug'

const source = Quill.sources.USER
export const MARK_BACKGROUND = 'rgba(255, 229, 100, 0.55)'

const getLineInfo = (quill, range) => {
  const [line, offset] = quill.getLine(range.index)
  if (!line) {
    return null
  }
  const lineStart = range.index - offset
  const lineText = line.domNode.textContent || ''
  return {
    line,
    offset,
    lineStart,
    lineText
  }
}

const deleteMarker = (quill, lineStart, length) => {
  quill.deleteText(lineStart, length, source)
}

const applyLineFormat = (quill, range, markerLength, format, value) => {
  const lineInfo = getLineInfo(quill, range)
  if (!lineInfo) {
    return false
  }
  deleteMarker(quill, lineInfo.lineStart, markerLength)
  quill.formatLine(lineInfo.lineStart, 1, format, value, source)
  quill.setSelection(lineInfo.lineStart, 0, source)
  return false
}

const insertDivider = (quill, range, markerLength) => {
  const lineInfo = getLineInfo(quill, range)
  if (!lineInfo) {
    return false
  }
  deleteMarker(quill, lineInfo.lineStart, markerLength)
  quill.clipboard.dangerouslyPasteHTML(lineInfo.lineStart, '<hr>', source)
  quill.setSelection(lineInfo.lineStart + 1, 0, source)
  return false
}

const lineShortcutRules = [
  {
    pattern: /^(#{1,6})$/,
    format: 'header',
    value: match => match[1].length,
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'header', match[1].length)
    }
  },
  {
    pattern: /^[-*+]$/,
    format: 'list',
    value: 'bullet',
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'list', 'bullet')
    }
  },
  {
    pattern: /^\d+\.$/,
    format: 'list',
    value: 'ordered',
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'list', 'ordered')
    }
  },
  {
    pattern: /^[-*+]\s+\[\s\]$/,
    format: 'list',
    value: 'unchecked',
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'list', 'unchecked')
    }
  },
  {
    pattern: /^[-*+]\s+\[[xX]\]$/,
    format: 'list',
    value: 'checked',
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'list', 'checked')
    }
  },
  {
    pattern: /^>\s?$/,
    format: 'blockquote',
    value: true,
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'blockquote', true)
    }
  },
  {
    pattern: /^```$/,
    format: 'code-block',
    value: true,
    apply: (quill, range, match) => {
      return applyLineFormat(quill, range, match[0].length, 'code-block', true)
    }
  },
  {
    pattern: /^-{3,}$/,
    type: 'divider',
    apply: (quill, range, match) => {
      return insertDivider(quill, range, match[0].length)
    }
  }
]

const inlineRules = [
  {
    pattern: /\*\*([^*\n]+)\*\*$/,
    format: { bold: true },
    markerLength: 2
  },
  {
    pattern: /__([^_\n]+)__$/,
    format: { bold: true },
    markerLength: 2
  },
  {
    pattern: /\*([^*\n]+)\*$/,
    format: { italic: true },
    markerLength: 1
  },
  {
    pattern: /_([^_\n]+)_$/,
    format: { italic: true },
    markerLength: 1
  },
  {
    pattern: /~~([^~\n]+)~~$/,
    format: { strike: true },
    markerLength: 2
  },
  {
    pattern: /`([^`\n]+)`$/,
    format: { code: true },
    markerLength: 1
  },
  {
    pattern: /==([^=\n]+)==$/,
    format: { background: MARK_BACKGROUND },
    markerLength: 2
  },
  {
    pattern: /\$([^$\n]+)\$$/,
    embed: 'formula',
    markerLength: 1
  }
]

export const getLineMarkdownMatch = text => {
  for (const rule of lineShortcutRules) {
    const match = text.match(rule.pattern)
    if (match) {
      return {
        fullMatch: match[0],
        format: rule.format,
        value:
          typeof rule.value === 'function' ? rule.value(match) : rule.value,
        type: rule.type
      }
    }
  }
  return null
}

export const getInlineMarkdownMatch = text => {
  for (const rule of inlineRules) {
    const match = text.match(rule.pattern)
    if (match) {
      return {
        fullMatch: match[0],
        content: match[1],
        format: rule.format,
        embed: rule.embed
      }
    }
  }
  return null
}

const tryLineShortcut = (quill, range) => {
  const lineInfo = getLineInfo(quill, range)
  if (!lineInfo || lineInfo.offset !== lineInfo.lineText.length) {
    return true
  }
  const prefix = lineInfo.lineText.slice(0, lineInfo.offset)
  for (const rule of lineShortcutRules) {
    const match = prefix.match(rule.pattern)
    if (match) {
      debugMindMap('mindmap-markdown', 'line shortcut matched', {
        fullMatch: match[0],
        format: rule.format,
        value:
          typeof rule.value === 'function' ? rule.value(match) : rule.value,
        type: rule.type
      })
      return rule.apply(quill, range, match)
    }
  }
  return true
}

const tryInlineShortcut = (quill, range, insertedText) => {
  const lineInfo = getLineInfo(quill, range)
  if (!lineInfo) {
    return
  }
  const textBeforeCursor = lineInfo.lineText.slice(0, lineInfo.offset)
  const match = getInlineMarkdownMatch(textBeforeCursor)
  if (match) {
    const matchStart = range.index - match.fullMatch.length
    debugMindMap('mindmap-markdown', 'inline shortcut matched', {
      fullMatch: match.fullMatch,
      content: match.content,
      format: match.format,
      embed: match.embed || null,
      matchStart
    })
    quill.deleteText(matchStart, match.fullMatch.length, source)
    if (match.embed) {
      quill.insertEmbed(matchStart, match.embed, match.content, source)
      quill.setSelection(matchStart + 1, 0, source)
      return
    }
    quill.insertText(matchStart, match.content, source)
    quill.formatText(matchStart, match.content.length, match.format, source)
    quill.setSelection(matchStart + match.content.length, 0, source)
  }
}

const tryLinkShortcut = (quill, range, insertedText) => {
  const lineInfo = getLineInfo(quill, range)
  if (!lineInfo) {
    return
  }
  const textBeforeCursor = lineInfo.lineText.slice(0, lineInfo.offset)
  const match = textBeforeCursor.match(/\[([^\]\n]+)\]\(([^)\n]+)\)$/)
  if (!match) {
    return
  }
  const fullMatch = match[0]
  const label = match[1]
  const url = match[2]
  const matchStart = range.index - fullMatch.length
  debugMindMap('mindmap-markdown', 'link shortcut matched', {
    fullMatch,
    label,
    url,
    matchStart
  })
  quill.deleteText(matchStart, fullMatch.length, source)
  quill.insertText(matchStart, label, { link: url }, source)
  quill.setSelection(matchStart + label.length, 0, source)
}

class MarkdownShortcuts {
  constructor(quill) {
    this.quill = quill
    this.handleTextChange = this.handleTextChange.bind(this)
    quill.keyboard.addBinding({ key: ' ' }, range => {
      return tryLineShortcut(quill, range)
    })
    quill.on(Quill.events.TEXT_CHANGE, this.handleTextChange)
  }

  handleTextChange(delta, oldDelta, eventSource) {
    if (eventSource !== source) {
      return
    }
    const range = this.quill.getSelection()
    if (!range) {
      return
    }
    const insertedOp = delta.ops.find(op => typeof op.insert === 'string')
    if (!insertedOp || insertedOp.insert.length !== 1) {
      return
    }
    tryInlineShortcut(this.quill, range, insertedOp.insert)
    if (insertedOp.insert === ')') {
      tryLinkShortcut(this.quill, range, insertedOp.insert)
    }
  }
}

export default MarkdownShortcuts
