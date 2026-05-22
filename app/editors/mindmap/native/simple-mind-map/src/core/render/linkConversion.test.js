import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = f => fs.readFileSync(f, 'utf-8')
const renderPath = path.join(__dirname, 'Render.js')

describe('Link conversion commands in Render', () => {
  const source = read(renderPath)

  it('registers CONVERT_HYPERLINK_TO_INLINE command', () => {
    expect(source).toContain('CONVERT_HYPERLINK_TO_INLINE')
    expect(source).toContain('convertHyperlinkToInline')
  })

  it('registers CONVERT_INLINE_LINK_TO_HYPERLINK command', () => {
    expect(source).toContain('CONVERT_INLINE_LINK_TO_HYPERLINK')
    expect(source).toContain('convertInlineLinkToHyperlink')
  })

  it('convertHyperlinkToInline reads hyperlink and markdown from node', () => {
    expect(source).toContain("node.getData('hyperlink')")
    expect(source).toContain("node.getData('hyperlinkTitle')")
    expect(source).toContain("node.getData('markdown')")
  })

  it('convertHyperlinkToInline generates markdown link syntax', () => {
    expect(source).toMatch(/\[.*title.*\]\(.*hyperlink.*\)/)
  })

  it('convertHyperlinkToInline clears hyperlink after conversion', () => {
    expect(source).toContain("hyperlink: ''")
    expect(source).toContain("hyperlinkTitle: ''")
  })

  it('convertInlineLinkToHyperlink uses link regex to find first link', () => {
    expect(source).toContain('\\[([^\\]]*)\\]\\(([^)]+)\\)')
  })

  it('convertInlineLinkToHyperlink sets extracted URL as hyperlink', () => {
    expect(source).toContain('hyperlink: url')
  })

  it('convertInlineLinkToHyperlink collapses excessive newlines', () => {
    expect(source).toContain("replace(/\\n{3,}/g, '\\n\\n')")
  })

  it('both commands call createMarkdownRenderCache and SET_NODE_DATA', () => {
    expect(source).toContain('createMarkdownRenderCache(newMarkdown)')
    expect(source).toContain("'SET_NODE_DATA'")
  })
})
