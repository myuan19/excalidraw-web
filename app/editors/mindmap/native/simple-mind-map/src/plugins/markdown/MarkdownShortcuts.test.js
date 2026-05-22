import { describe, expect, it } from 'vitest'
import { getInlineMarkdownMatch, getLineMarkdownMatch } from './MarkdownShortcuts'

describe('MarkdownShortcuts helpers', () => {
  it('recognizes line Markdown syntax at the cursor boundary', () => {
    expect(getLineMarkdownMatch('---')).toMatchObject({
      fullMatch: '---',
      type: 'divider'
    })
    expect(getLineMarkdownMatch('- [ ]')).toMatchObject({
      fullMatch: '- [ ]',
      format: 'list',
      value: 'unchecked'
    })
    expect(getLineMarkdownMatch('- [x]')).toMatchObject({
      fullMatch: '- [x]',
      format: 'list',
      value: 'checked'
    })
  })

  it('recognizes inline Markdown syntax at the cursor boundary', () => {
    expect(getInlineMarkdownMatch('hello **world**')).toEqual({
      fullMatch: '**world**',
      content: 'world',
      format: { bold: true }
    })
    expect(getInlineMarkdownMatch('hello `code`')).toEqual({
      fullMatch: '`code`',
      content: 'code',
      format: { code: true }
    })
    expect(getInlineMarkdownMatch('hello ==mark==')).toEqual({
      fullMatch: '==mark==',
      content: 'mark',
      format: { background: 'rgba(255, 229, 100, 0.55)' }
    })
    expect(getInlineMarkdownMatch('hello $x^2$')).toEqual({
      fullMatch: '$x^2$',
      content: 'x^2',
      embed: 'formula'
    })
    expect(getInlineMarkdownMatch('plain text')).toBe(null)
  })
})
