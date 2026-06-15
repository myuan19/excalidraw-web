/**
 * 富文本 HTML 的「视觉为空」归一化。
 *
 * Toast UI 编辑器清空内容后 getHTML() 返回 `<p><br></p>` 这类非空字符串，
 * 直接落库会让「无备注」判断（truthy 检查）失效。写入前统一归一：
 * 没有文本、也没有图片等实体内容的 HTML 视为空串。
 */

const EMBED_CONTENT_SELECTOR = 'img, video, audio, iframe, table, hr'

export function normalizeRichTextHtml(html) {
  const raw = (html || '').trim()
  if (!raw) {
    return ''
  }
  const container = document.createElement('div')
  container.innerHTML = raw
  const hasText = (container.textContent || '').trim().length > 0
  const hasEmbed = !!container.querySelector(EMBED_CONTENT_SELECTOR)
  return hasText || hasEmbed ? raw : ''
}
