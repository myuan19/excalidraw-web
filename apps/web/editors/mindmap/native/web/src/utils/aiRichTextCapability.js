/** AI 富文本能力与 aiTreeJson normalizeSpan 对齐的单一事实来源 */

export const AI_RICH_TEXT_SPAN_FIELDS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'font',
  'size',
  'formula'
]

export const AI_RICH_TEXT_PARAGRAPH_FIELDS = ['align', 'indent']

export const AI_NODE_WRITABLE_FIELDS = ['text', 'note', 'hyperlink']

export const AI_NODE_READONLY_STYLE_KEYS = [
  'shape',
  'fillColor',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'textAlign',
  'lineColor',
  'lineWidth',
  'lineDasharray'
]

export function buildLeadingSpaceRule() {
  return '<leading_spaces>是否使用 span.text 行首空格，完全由 user_requirement 决定。若 user_requirement 要求某些行做视觉缩进（例如“没加粗的行前加 2 空格”），只在满足条件的行 span.text 开头输出所需数量的普通空格，不要给不满足条件的行（例如已加粗标题行）统一加空格。若 user_requirement 未要求空格排版，不要擅自添加行首空格。不要用 span.text 前导空格模拟思维导图树形层级；树形层级优先 add_child，段落层级用 paragraph.indent。</leading_spaces>'
}

export function buildStyledOutputExamples() {
  return [
    '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"需要高亮的文字","background":"#fff2cc"}]}]}}',
    '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"斜体强调","italic":true}]}]}}',
    '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"下划线","underline":true},{"text":" 删除线","strike":true},{"text":" 红色文字","color":"#d93025"}]}]}}',
    '{"op":"update_current","text":{"paragraphs":[{"align":"center","spans":[{"text":"居中标题"}]}]}}',
    '{"op":"update_current","text":{"paragraphs":[{"spans":[{"formula":"E=mc^2"}]}]}}'
  ].join('\n')
}

export function buildStyleSchemaText() {
  return 'align 仅 left/center/right。indent 仅在用户明确要求段落缩进时使用。bold/italic/underline/strike 用 true；color/background 用 #RRGGBB；font 为字体；size 如 "16px"；formula 为 LaTeX 字符串（渲染为 $...$）。样式只作用于带字段的 span，多个片段需分别写字段；动词高亮用 background，形容词下划线用 underline:true。'
}

export function buildVisualReferenceText() {
  return '视觉参考只使用 current_node_style 和 current；不要根据整图或子节点推断。current_node_style（含 lineColor/fillColor 等）是只读参考，不能通过 update_current 修改；左边分支连线颜色由主题/彩虹连线决定，不要尝试写入节点连线或填充色。若要求保持/参考当前样式，尽量保留现有富文本样式，只改用户明确要求的文字或样式。'
}

export function buildTextSchemaSuffix(childrenField = '') {
  return `text 必须是 {"paragraphs":[{"spans":[{"text":"文本"}]}]}。paragraph 可带 align/indent；span 可带 ${AI_RICH_TEXT_SPAN_FIELDS.join('/')}。note 是普通文本；hyperlink 是 URL。${childrenField}`
}
