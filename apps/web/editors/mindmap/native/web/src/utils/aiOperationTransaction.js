import { getAiOperationKey, parseAiOperationStreamChunk } from '@/utils/aiOperationStream'
import {
  quillHtmlToRichTextJson,
  summarizeRichTextJson
} from '@/utils/aiTreeJson'
import { assertAiOperationAllowed } from '@/utils/aiOperationPolicy'
import {
  pauseMindMapCommand,
  recoveryMindMapCommand
} from '@/utils/mindMapAiCommandBridge'
import {
  applyAiAddChild,
  applyAiDeleteNode,
  applyAiUpdateNodeData
} from '@/utils/mindMapAiNodeMutation'
import { commitMindMapAiSession } from '@/utils/mindMapAiPersistCommit'

function summarizeAiOperation(operation) {
  const text =
    operation && operation.data && operation.data.text
      ? operation.data.text
      : operation && operation.node && operation.node.data
        ? operation.node.data.text
        : ''
  const richTextSummary = text
    ? summarizeRichTextJson(quillHtmlToRichTextJson(text))
    : null
  return {
    op: operation && operation.op,
    id: operation && operation.id,
    parent: operation && operation.parent,
    hasText: !!text,
    textLen: text ? String(text).length : 0,
    richTextSummary
  }
}

export function createAiOperationTransactionState({
  mindMap,
  node,
  permission,
  buildOriginalNodeRefMap,
  debug
}) {
  const baseFullData = mindMap.getData(true)
  const refState = buildOriginalNodeRefMap(node.nodeData, permission)
  pauseMindMapCommand(mindMap)
  const tx = {
    baseFullData,
    permission,
    targetUid: node.getData('uid'),
    originalRefToUid: refState.refToUid,
    allowedUidSet: refState.allowedUidSet,
    createdNodeIds: {},
    createdUidSet: new Set(),
    appliedOpIds: new Set(),
    offset: 0,
    appliedCount: 0,
    done: false
  }
  debug?.('mindmap-ai-opstream', 'transaction start', {
    targetUid: tx.targetUid,
    editScope: permission.editScope,
    canCreateChildren: permission.canCreateChildren,
    canDeleteChildren: permission.canDeleteChildren,
    allowedOps: permission.allowedOps,
    allowedOriginalCount: tx.allowedUidSet.size
  })
  return tx
}

export function endAiOperationTransactionState(mindMap) {
  recoveryMindMapCommand(mindMap)
}

export function rollbackAiOperationTransactionState(mindMap, tx, deps) {
  if (!tx) {
    return
  }
  const { cloneJson, runAiOperationMutation, debug } = deps
  runAiOperationMutation(() => {
    mindMap.renderer.setData(cloneJson(tx.baseFullData.root))
    mindMap.reRender()
  })
  debug?.('mindmap-ai-opstream', 'transaction rollback', {
    reason: deps.reason || 'rollback',
    appliedCount: tx.appliedCount
  })
  endAiOperationTransactionState(mindMap)
}

export function commitAiOperationTransactionState(mindMap, tx, deps) {
  if (!tx) {
    return
  }
  commitMindMapAiSession(mindMap, tx, deps)
  deps.debug?.('mindmap-ai-opstream', 'transaction commit', {
    appliedCount: tx.appliedCount
  })
}

function resolveAiOperationRef(tx, ref) {
  if (!tx) {
    return ''
  }
  if (ref === 'current') {
    return tx.targetUid
  }
  if (tx.createdNodeIds[ref]) {
    return tx.createdNodeIds[ref]
  }
  if (tx.originalRefToUid[ref]) {
    return tx.originalRefToUid[ref]
  }
  if (tx.allowedUidSet.has(ref) || tx.createdUidSet.has(ref)) {
    return ref
  }
  return ''
}

function skipAiOperation(tx, operation, reason, debug, extra = {}) {
  if (!tx) {
    return false
  }
  const operationKey = getAiOperationKey(operation)
  if (operationKey) {
    tx.appliedOpIds.add(operationKey)
  }
  debug?.('mindmap-ai-opstream', 'skip operation', {
    reason,
    op: operation?.op,
    id: operation?.id,
    parent: operation?.parent,
    ...extra
  })
  return false
}

function assertAiOperationNodeInScope(tx, uid) {
  if (!tx || !uid) {
    throw new Error('ai operation target missing')
  }
  if (
    uid !== tx.targetUid &&
    !tx.allowedUidSet.has(uid) &&
    !tx.createdUidSet.has(uid)
  ) {
    throw new Error('ai operation target out of scope')
  }
}

export function applyAiOperation(mindMap, tx, operation, deps) {
  if (!tx) {
    throw new Error('ai operation transaction missing')
  }
  const { cloneJson, ensureAiNodeDataUid, getAiOperationPermission, debug } = deps
  const deferRender = deps.deferRender === true
  const operationKey = getAiOperationKey(operation)
  if (operationKey && tx.appliedOpIds.has(operationKey)) {
    return false
  }
  if (operation.op === 'done') {
    tx.done = true
    if (operationKey) {
      tx.appliedOpIds.add(operationKey)
    }
    return false
  }
  const permission = tx.permission || getAiOperationPermission()
  assertAiOperationAllowed(permission, operation)

  if (operation.op === 'add_child') {
    if (tx.createdNodeIds[operation.id]) {
      if (operationKey) {
        tx.appliedOpIds.add(operationKey)
      }
      return false
    }
    const parentUid = resolveAiOperationRef(tx, operation.parent)
    if (!parentUid) {
      return skipAiOperation(tx, operation, 'missing-parent-ref', debug)
    }
    assertAiOperationNodeInScope(tx, parentUid)
    const addResult = applyAiAddChild(mindMap, parentUid, operation.node, {
      cloneJson,
      ensureAiNodeDataUid
    })
    if (!addResult.ok) {
      return skipAiOperation(tx, operation, addResult.reason || 'add-child-failed', debug, {
        parentUid
      })
    }
    tx.createdNodeIds[operation.id] = addResult.uid
    tx.createdUidSet.add(addResult.uid)
    if (operationKey) {
      tx.appliedOpIds.add(operationKey)
    }
    mindMap?.renderer?.renderOrchestrator?.noteTreeMutation?.()
    tx.appliedCount += 1
    return true
  }

  if (operation.op === 'delete_node') {
    const uid = resolveAiOperationRef(tx, operation.id)
    if (!uid) {
      return skipAiOperation(tx, operation, 'missing-delete-ref', debug)
    }
    if (uid === tx.targetUid) {
      throw new Error('ai operation cannot delete current node')
    }
    assertAiOperationNodeInScope(tx, uid)
    const deleteResult = applyAiDeleteNode(mindMap, uid)
    if (!deleteResult.ok) {
      return skipAiOperation(tx, operation, deleteResult.reason || 'delete-failed', debug, {
        uid
      })
    }
    if (operationKey) {
      tx.appliedOpIds.add(operationKey)
    }
    mindMap?.renderer?.renderOrchestrator?.noteTreeMutation?.()
    tx.appliedCount += 1
    return true
  }

  const uid = resolveAiOperationRef(tx, operation.id)
  if (!uid) {
    return skipAiOperation(tx, operation, 'missing-update-ref', debug)
  }
  assertAiOperationNodeInScope(tx, uid)
  const updateResult = applyAiUpdateNodeData(mindMap, uid, operation.data, {
    deferRender
  })
  if (!updateResult.ok) {
    return skipAiOperation(tx, operation, updateResult.reason || 'update-failed', debug, {
      uid
    })
  }
  if (operationKey) {
    tx.appliedOpIds.add(operationKey)
  }
  mindMap?.renderer?.renderOrchestrator?.noteTreeMutation?.()
  tx.appliedCount += 1
  return true
}

export function applyAiOperationStreamContent(mindMap, tx, content, final, deps) {
  if (!tx) {
    return { appliedCount: 0, done: false }
  }
  const { runAiOperationMutation, debug } = deps
  const result = parseAiOperationStreamChunk(content, {
    offset: tx.offset,
    final,
    allowInlineStyles: tx.permission.allowInlineStyles,
    allowedOps: tx.permission.allowedOps
  })
  if (result.operations.length > 0) {
    debug?.('mindmap-ai-opstream', 'parsed operation batch', {
      final,
      fromOffset: tx.offset,
      toOffset: result.offset,
      operationCount: result.operations.length,
      allowInlineStyles: tx.permission.allowInlineStyles,
      allowedOps: tx.permission.allowedOps,
      operations: result.operations.map(op => summarizeAiOperation(op))
    })
  }
  runAiOperationMutation(() => {
    let hasChanged = false
    const streamDeps = { ...deps, deferRender: true }
    result.operations.forEach(operation => {
      if (applyAiOperation(mindMap, tx, operation, streamDeps)) {
        hasChanged = true
      }
    })
    if (hasChanged) {
      mindMap.render(null, 'ai-stream-batch')
    }
    return hasChanged
  })
  tx.offset = result.offset
  return {
    appliedCount: result.operations.length,
    done: tx.done
  }
}
