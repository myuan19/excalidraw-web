import {
  commitMindMapSnapshot,
  recoveryMindMapCommand
} from './mindMapAiCommandBridge'

/**
 * AI 会话提交：解除 pause → 最终 render → 写入历史 / 兜底 data_change。
 */
export function commitMindMapAiSession(mindMap, tx, deps = {}) {
  const debug = deps.debug
  recoveryMindMapCommand(mindMap)
  const skipCommitRender =
    mindMap?.renderer?.renderOrchestrator?.shouldSkipCommitRender?.() === true
  if (!skipCommitRender) {
    mindMap?.render?.(null, 'ai-session-commit')
  }

  const command = mindMap?.command
  const before = {
    historyLen: command?.history?.length ?? 0,
    activeIndex: command?.activeHistoryIndex ?? -1
  }
  commitMindMapSnapshot(mindMap, debug)
  const after = {
    historyLen: command?.history?.length ?? 0,
    activeIndex: command?.activeHistoryIndex ?? -1
  }
  const committed =
    after.historyLen > before.historyLen || after.activeIndex !== before.activeIndex

  if (!committed && command?.getCopyData) {
    const snapshot = command.getCopyData()
    if (snapshot) {
      mindMap.emit('data_change', snapshot)
      debug?.('mindmap-persist', 'commitMindMapAiSession fallback data_change', {
        fileId8: null,
        reason: 'history-dedup-skipped',
        baseChanged:
          tx?.baseFullData &&
          JSON.stringify(snapshot.root) !== JSON.stringify(tx.baseFullData.root)
      })
    }
  }

  debug?.('mindmap-ai-opstream', 'commitMindMapAiSession', {
    committed,
    historyAfter: after.historyLen,
    appliedCount: tx?.appliedCount ?? null
  })
  return committed
}
