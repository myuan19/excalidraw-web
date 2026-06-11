import { createUid } from 'simple-mind-map/src/utils'

/**
 * AI 突变网关：只改 renderTree / nodeData，不触发 execCommand、不 render。
 * 渲染与持久化由 aiOperationTransaction（批次）与 mindMapAiPersistCommit（提交）负责。
 */

export function findAiDataNodeByUid(mindMap, uid) {
  const root = mindMap?.renderer?.renderTree ?? null
  let result = null
  const walk = (dataNode, parent = null, index = -1) => {
    if (!dataNode || result) {
      return
    }
    if (dataNode.data && dataNode.data.uid === uid) {
      result = { dataNode, parent, index }
      return
    }
    const children = Array.isArray(dataNode.children) ? dataNode.children : []
    children.forEach((child, childIndex) => {
      walk(child, dataNode, childIndex)
    })
  }
  walk(root)
  return result
}

function resolveAiDataNode(mindMap, uid) {
  const node = mindMap?.renderer?.findNodeByUid?.(uid)
  if (node?.nodeData) {
    return node.nodeData
  }
  return findAiDataNodeByUid(mindMap, uid)?.dataNode ?? null
}

function prepareAiChildPayload(nodePayload, deps) {
  const { cloneJson, ensureAiNodeDataUid } = deps
  const child = cloneJson(nodePayload)
  child.data = child.data || {}
  if (!child.data.uid) {
    child.data.uid = createUid()
  }
  ensureAiNodeDataUid?.(child)
  child.children = Array.isArray(child.children) ? child.children : []
  return child
}

function buildAiTreeChildNode(child) {
  const data = { ...child.data }
  delete data.inserting
  delete data.resetRichText
  return {
    data,
    children: child.children
  }
}

function appendAiChildToDataNode(dataNode, child) {
  if (!Array.isArray(dataNode.children)) {
    dataNode.children = []
  }
  dataNode.children.push(buildAiTreeChildNode(child))
  if (dataNode.data) {
    dataNode.data.expand = true
  }
}

function markAiDataNodeStale(dataNode) {
  if (dataNode?.data) {
    dataNode.data.needUpdate = true
  }
}

export function applyAiUpdateNodeData(mindMap, uid, patch, opts = {}) {
  const deferRender = opts.deferRender === true
  const renderer = mindMap?.renderer
  const node = renderer?.findNodeByUid?.(uid)
  if (node && typeof renderer.setNodeDataRender === 'function') {
    renderer.setNodeDataRender(node, patch, deferRender)
    return { ok: true, via: 'setNodeDataRender' }
  }

  const dataNode = resolveAiDataNode(mindMap, uid)
  if (!dataNode?.data) {
    return { ok: false, reason: 'data-node-not-found' }
  }
  Object.keys(patch).forEach(key => {
    dataNode.data[key] = patch[key]
  })
  if (patch.text !== undefined || patch.richText !== undefined) {
    renderer?.invalidateTextContent?.(uid)
  }
  markAiDataNodeStale(dataNode)
  return { ok: true, via: 'tree' }
}

export function applyAiAddChild(mindMap, parentUid, nodePayload, deps) {
  const parentDataNode = resolveAiDataNode(mindMap, parentUid)
  if (!parentDataNode) {
    return { ok: false, reason: 'parent-not-found' }
  }
  const child = prepareAiChildPayload(nodePayload, deps)
  appendAiChildToDataNode(parentDataNode, child)
  mindMap?.renderer?.markTreeStructureDirty?.(parentUid, child.data.uid)
  return { ok: true, via: 'tree', uid: child.data.uid }
}

export function applyAiDeleteNode(mindMap, uid) {
  const targetRef = findAiDataNodeByUid(mindMap, uid)
  if (!targetRef?.parent || targetRef.index < 0) {
    return { ok: false, reason: 'delete-target-not-found' }
  }
  targetRef.parent.children.splice(targetRef.index, 1)
  const parentUid = targetRef.parent.data?.uid
  if (parentUid) {
    mindMap?.renderer?.markTreeStructureDirty?.(parentUid)
  }
  markAiDataNodeStale(targetRef.parent)
  return { ok: true, via: 'tree' }
}

export function applyAiOrganizeResultToMindMap(mindMap, targetUid, result, deps) {
  const updateResult = applyAiUpdateNodeData(mindMap, targetUid, result.current.data, {
    deferRender: true
  })
  if (!updateResult.ok) {
    throw new Error('target node missing')
  }
  const children = result.children || []
  for (const child of children) {
    const addResult = applyAiAddChild(mindMap, targetUid, child, deps)
    if (!addResult.ok) {
      throw new Error(addResult.reason || 'add child failed')
    }
  }
  return true
}
