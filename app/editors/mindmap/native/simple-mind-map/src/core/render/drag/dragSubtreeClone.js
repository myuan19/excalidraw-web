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

/** foreignObject 深拷贝会复制/劫持 HTML，松手后易残留为第二个可交互节点 */
export function stripForeignObjectsFromClone(clone) {
  if (!clone?.find) {
    return
  }
  clone.find('foreignObject').forEach(foreignObject => {
    const host = foreignObject.node
    if (host) {
      while (host.firstChild) {
        host.removeChild(host.firstChild)
      }
    }
    foreignObject.remove()
  })
}

export function cloneNodeGroupForDrag(nodeGroup) {
  const nodeClone = nodeGroup.clone()
  removeDragCloneControls(nodeClone)
  stripForeignObjectsFromClone(nodeClone)
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
    stripForeignObjectsFromClone(root)
    root.remove()
  })
}

export function disposeDragCloneLayer(otherDraw, cloneRef) {
  if (cloneRef) {
    stripForeignObjectsFromClone(cloneRef)
    cloneRef.remove()
  }
  purgeDragCloneRoots(otherDraw)
}
