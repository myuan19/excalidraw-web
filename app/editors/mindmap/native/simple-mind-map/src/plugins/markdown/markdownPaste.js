import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
import { debugMindMap, summarizeHtml, summarizeMarkdown } from '../../utils/mindMapDebug'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})
md.use(markdownItMark)

const FORMULA_PLACEHOLDER = 'SMM_FORMULA_PLACEHOLDER'

const markdownPatterns = [
  /^#{1,6}\s+\S/m,
  /^[-*+]\s+\S/m,
  /^\d+\.\s+\S/m,
  /^>\s+\S/m,
  /^```[\s\S]*```/m,
  /^-{3,}\s*$/m,
  /\*\*[^*\n]+?\*\*/m,
  /__[^_\n]+?__/m,
  /\*[^*\n]+?\*/m,
  /_[^_\n]+?_/m,
  /~~[^~\n]+?~~/m,
  /==[^=\n]+?==/m,
  /`[^`\n]+?`/m,
  /\$\$[\s\S]+?\$\$/m,
  /\$[^$\n]+?\$/m,
  /\[[^\]\n]+?\]\([^)]+?\)/m,
  /!\[[^\]\n]*?\]\([^)]+?\)/m,
  /^\|.+\|\s*$/m,
  /^[-*+]\s+\[[ xX]\]\s+\S/m
]

export const looksLikeMarkdown = text => {
  if (!text || typeof text !== 'string') {
    debugMindMap(
      'mindmap-markdown',
      'looksLikeMarkdown skipped: empty or non-string',
      {
        valueType: typeof text
      },
      { verbose: true }
    )
    return false
  }
  const trimmed = text.trim()
  const matchedPatternIndex = markdownPatterns.findIndex(pattern =>
    pattern.test(trimmed)
  )
  const matched = matchedPatternIndex !== -1
  debugMindMap(
    'mindmap-markdown',
    'looksLikeMarkdown result',
    {
      matched,
      matchedPatternIndex,
      markdown: summarizeMarkdown(text)
    },
    { verbose: true }
  )
  return matched
}

const escapeHtml = text => {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const formulaHtml = ({ formula, isBlock }) => {
  const value = escapeHtml(formula.trim())
  return `<span class="ql-formula"${
    isBlock ? ' data-formula-block="true"' : ''
  } data-value="${value}"></span>`
}

const extractFormulas = text => {
  const formulas = []
  const pushFormula = (formula, isBlock) => {
    const token = `${FORMULA_PLACEHOLDER}_${formulas.length}`
    formulas.push({
      token,
      html: formulaHtml({ formula, isBlock })
    })
    return token
  }
  const nextText = String(text || '')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
      return pushFormula(formula, true)
    })
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, prefix, formula) => {
      return `${prefix}${pushFormula(formula, false)}`
    })
  return {
    text: nextText,
    formulas
  }
}

const renderTaskLists = html => {
  return html.replace(
    /<li>\[([ xX])\]\s*/g,
    (_, checked) =>
      `<li data-list="${
        checked.toLowerCase() === 'x' ? 'checked' : 'unchecked'
      }"><input type="checkbox" disabled${
        checked.toLowerCase() === 'x' ? ' checked' : ''
      }> `
  )
}

const restoreFormulas = (html, formulas) => {
  return formulas.reduce((res, item) => {
    return res.replace(new RegExp(item.token, 'g'), item.html)
  }, html)
}

export const renderMarkdownForQuill = text => {
  const { text: textWithFormulaTokens, formulas } = extractFormulas(text)
  const html = restoreFormulas(renderTaskLists(md.render(textWithFormulaTokens)), formulas)
  debugMindMap('mindmap-markdown', 'markdownToHtml done', {
    markdown: summarizeMarkdown(text),
    formulaCount: formulas.length,
    html: summarizeHtml(html)
  })
  return html
}

export const markdownToHtml = renderMarkdownForQuill
