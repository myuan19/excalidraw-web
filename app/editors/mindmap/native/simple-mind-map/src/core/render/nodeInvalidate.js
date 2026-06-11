export const INVALIDATE = {
  TREE_STRUCTURE: 'tree-structure',
  TEXT_CONTENT: 'text-content',
  STYLE_THEME: 'style-theme',
  EXPLICIT: 'explicit'
}

export function createNodeInvalidationState() {
  return {
    map: new Map()
  }
}

export function invalidateNodes(state, uids, reason) {
  if (!state || !reason) {
    return
  }
  const list = Array.isArray(uids) ? uids : [uids]
  list.forEach(uid => {
    if (!uid) {
      return
    }
    if (!state.map.has(uid)) {
      state.map.set(uid, new Set())
    }
    state.map.get(uid).add(reason)
  })
}

export function consumeNodeInvalidation(state, uid) {
  if (!state || !uid || !state.map.has(uid)) {
    return null
  }
  const reasons = state.map.get(uid)
  state.map.delete(uid)
  return reasons
}

export function collectAncestorUids(node) {
  const uids = []
  let current = node
  while (current) {
    if (current.uid) {
      uids.push(current.uid)
    }
    current = current.parent
  }
  return uids
}

export function markTreeStructureInvalidation(
  state,
  { parentUid, newChildUid, resolveParentNode }
) {
  const uids = new Set()
  const parentNode = resolveParentNode?.(parentUid)
  if (parentNode) {
    collectAncestorUids(parentNode).forEach(uid => uids.add(uid))
  } else if (parentUid) {
    uids.add(parentUid)
  }
  if (newChildUid) {
    uids.add(newChildUid)
  }
  invalidateNodes(state, [...uids], INVALIDATE.TREE_STRUCTURE)
  if (newChildUid) {
    invalidateNodes(state, newChildUid, INVALIDATE.EXPLICIT)
  }
}

export function markNodeMoveInvalidation(state, { movedNodes, targetParent }) {
  const uids = new Set()
  const nodes = Array.isArray(movedNodes) ? movedNodes : [movedNodes]
  nodes.forEach(item => {
    if (!item) {
      return
    }
    if (item.uid) {
      uids.add(item.uid)
    }
    if (item.getData?.('richText') && item.uid) {
      invalidateNodes(state, item.uid, INVALIDATE.TEXT_CONTENT)
    }
    collectAncestorUids(item.parent).forEach(uid => uids.add(uid))
  })
  if (targetParent) {
    collectAncestorUids(targetParent).forEach(uid => uids.add(uid))
  }
  if (uids.size > 0) {
    invalidateNodes(state, [...uids], INVALIDATE.TREE_STRUCTURE)
  }
}

export function resolveNodeRefreshPlan({
  invalidationReasons,
  isResizeSource = false,
  isNodeDataChange = false,
  isLayerTypeChange = false,
  resetRichText = false,
  needUpdate = false,
  isNodeInnerFixChange = false,
  childStructureChanged = false
}) {
  const reasons = invalidationReasons ? [...invalidationReasons] : []
  if (isResizeSource) {
    reasons.push(INVALIDATE.STYLE_THEME)
  }
  if (isNodeDataChange) {
    reasons.push(INVALIDATE.TEXT_CONTENT)
  }
  if (isLayerTypeChange) {
    reasons.push(INVALIDATE.EXPLICIT)
  }
  if (resetRichText || needUpdate || isNodeInnerFixChange) {
    reasons.push(INVALIDATE.EXPLICIT)
  }
  if (childStructureChanged) {
    reasons.push(INVALIDATE.TREE_STRUCTURE)
  }
  const refreshContent = reasons.length > 0
  return {
    reasons,
    refreshContent
  }
}
