export const DRAG_CLONE_ROOT_CLASS = 'smm-drag-clone-root'

const DRAG_CLONE_CONTROL_SELECTORS = [
  '.smm-expand-btn',
  '.smm-quick-create-child-btn',
  '.smm-node-add',
  '.smm-hover-node'
]

export function removeDragCloneControls(clone) {
  if (!clone?.find) {
    return
  }
  DRAG_CLONE_CONTROL_SELECTORS.forEach(selector => {
    clone.find(selector).forEach(item => {
      item.remove()
    })
  })
  clone.removeClass('active')
  clone.removeClass('smm-node-highlight')
}

export function cloneNodeGroupForDrag(nodeGroup) {
  const nodeClone = nodeGroup.clone()
  removeDragCloneControls(nodeClone)
  return nodeClone
}

export function collectVisibleDragCloneItems(node) {
  const list = []
  if (!node?.group) {
    return list
  }
  list.push(cloneNodeGroupForDrag(node.group))
  if (node.getData('expand') === false) {
    return list
  }
  node._lines.forEach(line => {
    if (line) {
      list.push(line.clone())
    }
  })
  node.children.forEach(child => {
    list.push(...collectVisibleDragCloneItems(child))
  })
  return list
}

export function createDragSubtreeClone(otherDraw, rootNode) {
  const root = otherDraw.group().addClass(DRAG_CLONE_ROOT_CLASS)
  // 预览层整体惰性化：克隆完整保留内容（含富文本foreignObject），但不可交互
  root.css('pointer-events', 'none')
  const content = root.group()
  content.translate(-rootNode.left, -rootNode.top)
  collectVisibleDragCloneItems(rootNode).forEach(item => {
    content.add(item)
  })
  return root
}

export function purgeDragCloneRoots(otherDraw) {
  if (!otherDraw?.find) {
    return
  }
  otherDraw.find(`.${DRAG_CLONE_ROOT_CLASS}`).forEach(root => {
    root.remove()
  })
}

export function disposeDragCloneLayer(otherDraw, cloneRef) {
  if (cloneRef) {
    cloneRef.remove()
  }
  purgeDragCloneRoots(otherDraw)
}
