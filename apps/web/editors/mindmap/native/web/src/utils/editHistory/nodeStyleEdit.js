/**
 * 节点样式侧栏：预览走 setStyle（拖动时由 dragSession 暂停历史），提交同样走 setStyle 并记一条历史。
 */
export function previewNodeStyleOnNodes(nodes, prop, value) {
  if (!nodes || !nodes.length) return
  nodes.forEach(node => {
    node.setStyle(prop, value)
  })
}

export function commitNodeStyleOnNodes(nodes, prop, value) {
  previewNodeStyleOnNodes(nodes, prop, value)
}

export function commitNodeStylesOnNodes(nodes, stylePatch) {
  if (!nodes || !nodes.length) return
  nodes.forEach(node => {
    node.setStyles(stylePatch)
  })
}
