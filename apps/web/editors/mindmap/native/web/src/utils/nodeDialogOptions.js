/**
 * 顶部工具栏节点属性弹窗（图片/超链接/备注等）共用配置。
 * append-to-body 避免 iframe 内层叠错位；modal=false 去掉全屏黑色半透明遮罩。
 */
export const NODE_DIALOG_PROPS = {
  appendToBody: true,
  modal: false,
  closeOnClickModal: false
}

/** 展示用：去掉 URL 协议前缀 */
export function stripUrlProtocol(url) {
  return (url || '').replace(/^https?:\/\//i, '')
}

/** 保存用：无协议时默认补 https:// */
export function normalizeNodeHyperlinkUrl(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}
