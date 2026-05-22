export const MARK_BACKGROUND = 'rgba(255, 229, 100, 0.55)'

const renderedSelector = '.smm-richtext-node-wrap'
const editorSelector = '.ql-editor'

const scopeSelectors = (selectors, scopes) => {
  return selectors
    .flatMap(selector => scopes.map(scope => `${scope} ${selector}`))
    .join(',\n')
}

export const getMarkdownCss = (scopes = [renderedSelector]) => `
  ${scopeSelectors(['p'], scopes)} {
    margin: 0;
  }

  ${scopeSelectors(['p + p'], scopes)} {
    margin-top: 0.35em;
  }

  ${scopeSelectors(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], scopes)} {
    margin: 0;
    font-weight: 700;
    line-height: 1.2;
  }

  ${scopeSelectors(['h1'], scopes)} {
    font-size: 1.6em;
  }

  ${scopeSelectors(['h2'], scopes)} {
    font-size: 1.45em;
  }

  ${scopeSelectors(['h3'], scopes)} {
    font-size: 1.3em;
  }

  ${scopeSelectors(['h4'], scopes)} {
    font-size: 1.15em;
  }

  ${scopeSelectors(['h5', 'h6'], scopes)} {
    font-size: 1em;
  }

  ${scopeSelectors(['ol', 'ul'], scopes)} {
    margin: 0.25em 0 0.45em;
    padding-left: 1.4em;
  }

  ${scopeSelectors(['blockquote'], scopes)} {
    border-left: 3px solid #d0d7de;
    color: #57606a;
    margin: 0.45em 0;
    padding-left: 0.75em;
  }

  ${scopeSelectors(['code'], scopes)} {
    background: rgba(175, 184, 193, 0.2);
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace;
    padding: 0.1em 0.25em;
  }

  ${scopeSelectors(['pre', '.ql-code-block-container'], scopes)} {
    background: rgba(175, 184, 193, 0.2);
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace;
    line-height: 1.35;
    margin: 0.45em 0;
    max-width: 100%;
    overflow-x: auto;
    padding: 0.45em 0.6em;
    white-space: pre;
  }

  ${scopeSelectors(['pre code'], scopes)} {
    background: transparent;
    display: block;
    padding: 0;
    white-space: pre;
  }

  ${scopeSelectors(['a'], scopes)} {
    color: #0969da;
    text-decoration: underline;
  }

  ${scopeSelectors(['table'], scopes)} {
    border-collapse: collapse;
    margin: 0.45em 0;
    max-width: 100%;
  }

  ${scopeSelectors(['th', 'td'], scopes)} {
    border: 1px solid #d0d7de;
    padding: 0.25em 0.5em;
  }

  ${scopeSelectors(['th'], scopes)} {
    background: rgba(175, 184, 193, 0.16);
    font-weight: 700;
  }

  ${scopeSelectors(['img'], scopes)} {
    display: block;
    margin: 0.45em 0;
    max-width: 100%;
  }

  ${scopeSelectors(['mark', '.ql-bg-yellow'], scopes)} {
    background: ${MARK_BACKGROUND};
    border-radius: 2px;
    padding: 0 0.12em;
  }

  ${scopeSelectors(['.ql-formula'], scopes)} {
    display: inline-block;
    font-size: 1em;
    vertical-align: middle;
  }

  ${scopeSelectors(['.ql-formula[data-formula-block="true"]'], scopes)} {
    display: block;
    margin: 0.35em 0;
    text-align: center;
  }

  ${scopeSelectors(['hr'], scopes)} {
    border: 0;
    border-top: 1px solid #d0d7de;
    margin: 0.45em 0;
  }

  ${scopeSelectors(['li[data-list="checked"]', 'li[data-list="unchecked"]'], scopes)} {
    list-style-type: none;
  }

  ${scopeSelectors(['li input[type="checkbox"]'], scopes)} {
    margin-right: 0.35em;
  }
`

export const getEditorAndRenderedMarkdownCss = () =>
  getMarkdownCss([editorSelector, renderedSelector])

export const getRenderedMarkdownCss = () => getMarkdownCss([renderedSelector])
