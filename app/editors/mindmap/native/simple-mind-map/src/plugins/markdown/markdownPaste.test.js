import { describe, expect, it } from 'vitest'
import { looksLikeMarkdown, markdownToHtml } from './markdownPaste'
import {
  createMarkdownRenderCache,
  htmlToMarkdown,
  markdownToRenderHtml,
  resolveMarkdownNodeHtml,
  setMarkdownRenderCacheNormalizer
} from './markdownStorage'

describe('markdownPaste helpers', () => {
  it('detects common Markdown blocks and inline marks', () => {
    expect(looksLikeMarkdown('# Title')).toBe(true)
    expect(looksLikeMarkdown('- item')).toBe(true)
    expect(looksLikeMarkdown('1. item')).toBe(true)
    expect(looksLikeMarkdown('> quote')).toBe(true)
    expect(looksLikeMarkdown('plain **bold** text')).toBe(true)
    expect(looksLikeMarkdown('==highlight==')).toBe(true)
    expect(looksLikeMarkdown('$x^2$')).toBe(true)
    expect(looksLikeMarkdown('$$\na^2 + b^2 = c^2\n$$')).toBe(true)
    expect(looksLikeMarkdown('---')).toBe(true)
    expect(looksLikeMarkdown('![alt](https://example.com/a.png)')).toBe(true)
    expect(looksLikeMarkdown('plain text only')).toBe(false)
  })

  it('renders pasted Markdown as HTML for Quill clipboard insertion', () => {
    const html = markdownToHtml(`# Title

- [x] Done
- [ ] Todo

| A | B |
| - | - |
| 1 | 2 |
`)

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<input type="checkbox" disabled checked>')
    expect(html).toContain('<input type="checkbox" disabled>')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders extended Markdown styles for paste', () => {
    const html = markdownToHtml(`Plain ==highlight== and $x^2$.

$$
a^2 + b^2 = c^2
$$

---

![Alt](https://example.com/a.png)
`)

    expect(html).toContain('<mark>highlight</mark>')
    expect(html).toContain('ql-formula')
    expect(html).toContain('data-value="x^2"')
    expect(html).toContain('data-formula-block="true"')
    expect(html).toContain('<hr')
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/a.png"')
  })

  it('round-trips Markdown as the primary storage format with HTML as render cache', () => {
    const markdown = `# Title

Plain **bold** and *italic* with ==mark== and [link](https://example.com).

- [x] Done
- [ ] Todo

> Quote

| A | B |
| - | - |
| 1 | 2 |

$x^2$
`
    const html = markdownToRenderHtml(markdown)
    const nextMarkdown = htmlToMarkdown(html)

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<table>')
    expect(html).toContain('ql-formula')
    expect(nextMarkdown).toContain('# Title')
    expect(nextMarkdown).toContain('**bold**')
    expect(nextMarkdown).toContain('*italic*')
    expect(nextMarkdown).toContain('==mark==')
    expect(nextMarkdown).toContain('[link](https://example.com)')
    expect(nextMarkdown).toContain('- [x] Done')
    expect(nextMarkdown).toContain('- [ ] Todo')
    expect(nextMarkdown).toContain('> Quote')
    expect(nextMarkdown).toContain('| A | B |')
    expect(nextMarkdown).toContain('$x^2$')
  })

  it('uses the Quill-normalized HTML cache as the only default render output', () => {
    setMarkdownRenderCacheNormalizer(html =>
      html.replace(/<mark>(.*?)<\/mark>/g, '<span style="background-color: rgb(255, 229, 100);">$1</span>')
    )
    const markdown = `# Title

Plain ==mark== and $x^2$.

| A | B |
| - | - |
| 1 | 2 |
`
    const cachedHtml = createMarkdownRenderCache(markdown)

    expect(resolveMarkdownNodeHtml({ markdown, html: cachedHtml })).toBe(cachedHtml)
    expect(cachedHtml).not.toContain('<mark>')
    expect(cachedHtml).toContain('background-color')
    expect(cachedHtml).toContain('ql-formula')
    setMarkdownRenderCacheNormalizer(null)
  })

  it('uses html cache when both markdown and html are present', () => {
    const markdown = '![MindMap](https://example.com/mindmap.png)'
    const htmlCache =
      '<p><img src="https://example.com/mindmap.png"></p>'
    const resolved = resolveMarkdownNodeHtml({
      markdown,
      html: htmlCache
    })
    expect(resolved).toBe(htmlCache)
  })

  it('rebuilds from markdown when html cache is missing', () => {
    const markdown = '![MindMap](https://example.com/mindmap.png)'
    const resolved = resolveMarkdownNodeHtml({
      markdown,
      html: undefined
    })
    expect(resolved).toContain('src="https://example.com/mindmap.png"')
  })

  it('keeps Typora-like block structures in the render cache', () => {
    const html = markdownToRenderHtml(`## 普通列表

- 无序列表第一项
- 无序列表第二项

1. 有序列表第一项
2. 有序列表第二项

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| 加粗 | 通过 | **bold** |

\`\`\`js
function hello() {
  return 1;
}
\`\`\`

![示例图片](https://example.com/a.png)
`)

    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<table>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<pre><code class="language-js">')
    expect(html).toContain('function hello()')
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/a.png"')
  })

  it('converts Quill list HTML back to Markdown list types and indentation', () => {
    const markdown = htmlToMarkdown(`
      <ol>
        <li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>无序列表第一项</li>
        <li class="ql-indent-1" data-list="bullet"><span class="ql-ui" contenteditable="false"></span>嵌套项 A</li>
        <li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>有序列表第一项</li>
      </ol>
    `)

    expect(markdown).toContain('- 无序列表第一项')
    expect(markdown).toContain('  - 嵌套项 A')
    expect(markdown).toContain('1. 有序列表第一项')
  })

  it('converts Quill code block containers and table-up wrappers back to Markdown', () => {
    const markdown = htmlToMarkdown(`
      <div class="ql-code-block-container" spellcheck="false">
        <div class="ql-code-block" data-language="javascript">function hello() {</div>
        <div class="ql-code-block" data-language="javascript">  return 1;</div>
        <div class="ql-code-block" data-language="javascript">}</div>
      </div>
      <div class="table-up-container">
        <table>
          <tbody>
            <tr>
              <td><div class="table-up-cell-inner">功能</div></td>
              <td><div class="table-up-cell-inner">状态</div></td>
            </tr>
            <tr>
              <td><div class="table-up-cell-inner"><strong>加粗</strong></div></td>
              <td><div class="table-up-cell-inner">通过</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    `)

    expect(markdown).toContain('```javascript')
    expect(markdown).toContain('function hello()')
    expect(markdown).toContain('  return 1;')
    expect(markdown).toContain('| 功能 | 状态 |')
    expect(markdown).toContain('| **加粗** | 通过 |')
  })
})
