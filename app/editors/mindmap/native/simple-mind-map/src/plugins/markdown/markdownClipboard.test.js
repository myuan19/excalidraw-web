import { describe, expect, it } from 'vitest'
import {
  appendMarkdownBlockToSource,
  createMarkdownClipboardNodeData,
  getClipboardMarkdownFromNode,
  isFullQuillSelection,
  toMarkdownSourceBlock
} from './markdownClipboard'

describe('markdownClipboard', () => {
  it('wraps pasted Markdown in a fenced markdown code block', () => {
    const source = '# Title\n\n- item'

    expect(toMarkdownSourceBlock(source)).toBe(
      '```markdown\n# Title\n\n- item\n```'
    )
  })

  it('uses a longer fence when pasted Markdown contains triple backticks', () => {
    const source = '```js\nconsole.log(1)\n```'

    expect(toMarkdownSourceBlock(source)).toBe(
      '````markdown\n```js\nconsole.log(1)\n```\n````'
    )
  })

  it('creates rich text node data from pasted Markdown source', () => {
    const nodeData = createMarkdownClipboardNodeData('# Title')

    expect(nodeData.richText).toBe(true)
    expect(nodeData.markdown).toBe('```markdown\n# Title\n```')
    expect(nodeData.text).toContain('<pre><code class="language-markdown">')
    expect(nodeData.text).toContain('# Title')
  })

  it('appends pasted Markdown source block to existing Markdown', () => {
    expect(appendMarkdownBlockToSource('Intro', '# Title')).toBe(
      'Intro\n\n```markdown\n# Title\n```'
    )
  })

  it('prefers pending Markdown source when copying a full selection', () => {
    const markdown = getClipboardMarkdownFromNode({
      pendingMarkdownSource: '# Pending',
      node: {
        getData: key => (key === 'markdown' ? '# Stored' : '')
      },
      html: '<h1>HTML</h1>',
      fullSelection: true
    })

    expect(markdown).toBe('# Pending')
  })

  it('converts selected HTML to Markdown when copying a partial selection', () => {
    const markdown = getClipboardMarkdownFromNode({
      selectedHtml: '<h2>Part</h2><ul><li data-list="bullet">item</li></ul>',
      fullSelection: false
    })

    expect(markdown).toBe('## Part\n\n- item')
  })

  it('detects full Quill selection', () => {
    expect(isFullQuillSelection({ index: 0, length: 4 }, 5)).toBe(true)
    expect(isFullQuillSelection({ index: 1, length: 4 }, 5)).toBe(false)
    expect(isFullQuillSelection({ index: 0, length: 2 }, 5)).toBe(false)
  })
})
