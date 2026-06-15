/** 仅存在于运行时、不得进入历史/持久化快照的节点字段 */
export const TRANSIENT_RENDER_TREE_NODE_KEYS = ['inserting']

/** 历史中的节点只保留用户语义数据，渲染期布局/测量字段不参与撤销粒度 */
export const HISTORY_RENDER_TREE_NODE_KEYS = ['data', 'children']

/** 历史快照顶层元数据（不属于树指纹） */
export const HISTORY_SNAPSHOT_META_KEYS = [
  'theme',
  'themeConfig',
  'layout',
  'outerFramePaddingX',
  'outerFramePaddingY',
  'rainbowLinesConfig',
  'smmVersion'
]

function walkRenderTree(root, fn, isRoot = true) {
  if (!root) {
    return
  }
  fn(root, isRoot)
  if (root.children && root.children.length > 0) {
    root.children.forEach(child => walkRenderTree(child, fn, false))
  }
}

/** 持久化边界：剥离运行时临时字段和布局测量字段 */
export function sanitizeRenderTreeSnapshot(root) {
  if (!root) {
    return root
  }
  walkRenderTree(root, (node, isRoot) => {
    TRANSIENT_RENDER_TREE_NODE_KEYS.forEach(key => {
      delete node[key]
      if (node.data) {
        delete node.data[key]
      }
    })
    if (node.data) {
      node.data.isActive = false
      const generalizationList = node.data.generalization
        ? Array.isArray(node.data.generalization)
          ? node.data.generalization
          : [node.data.generalization]
        : []
      generalizationList.forEach(item => {
        item.isActive = false
      })
    }
    Object.keys(node).forEach(key => {
      if (HISTORY_RENDER_TREE_NODE_KEYS.includes(key)) {
        return
      }
      if (isRoot && HISTORY_SNAPSHOT_META_KEYS.includes(key)) {
        return
      }
      delete node[key]
    })
  })
  return root
}

/** 从历史快照中提取纯渲染树，避免 theme/layout 等元数据污染 root 数据 */
export function getRenderTreeFromHistorySnapshot(snapshot) {
  if (!snapshot) {
    return snapshot
  }
  const tree = JSON.parse(JSON.stringify(snapshot))
  HISTORY_SNAPSHOT_META_KEYS.forEach(key => {
    delete tree[key]
  })
  return sanitizeRenderTreeSnapshot(tree)
}

/** 历史对比用纯树指纹（theme/layout 等元数据不参与） */
export function getHistoryTreeFingerprint(data) {
  if (!data) {
    return ''
  }
  return JSON.stringify(getRenderTreeFromHistorySnapshot(data))
}
