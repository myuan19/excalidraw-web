import { describe, it, expect } from 'vitest'
import { transformToMarkdown } from './toMarkdown'

describe('transformToMarkdown', () => {
  it('preserves markdown formatting from data.markdown', () => {
    const root = {
      data: { text: '<h1>Root</h1>', markdown: '# Root', richText: true },
      children: [
        {
          data: {
            text: '<p>code</p>',
            markdown: 'Some text\n\n```js\nconsole.log("hi")\n```',
            richText: true
          },
          children: []
        }
      ]
    }
    const md = transformToMarkdown(root)
    expect(md).toContain('```js')
    expect(md).toContain('console.log("hi")')
  })

  it('falls back to plain text extraction when no markdown field', () => {
    const root = {
      data: { text: 'Simple text' },
      children: []
    }
    const md = transformToMarkdown(root)
    expect(md).toContain('Simple text')
  })
})
