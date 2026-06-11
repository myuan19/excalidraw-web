/** AI 会话与原生 Command 的最薄桥接：pause / recovery / 历史提交。 */

export function pauseMindMapCommand(mindMap) {
  mindMap?.command?.pause?.()
}

export function recoveryMindMapCommand(mindMap) {
  mindMap?.command?.recovery?.()
}

/** 绕过 throttle，保证 data_change → storeData 必达。 */
export function commitMindMapSnapshot(mindMap, debug) {
  const command = mindMap?.command
  const before = {
    isPause: !!command?.isPause,
    historyLen: command?.history?.length ?? 0,
    activeIndex: command?.activeHistoryIndex ?? -1
  }
  if (command?.originAddHistory) {
    command.originAddHistory()
  }
  const after = {
    historyLen: command?.history?.length ?? 0,
    activeIndex: command?.activeHistoryIndex ?? -1
  }
  debug?.('mindmap-persist', 'commitMindMapSnapshot', {
    ...before,
    historyAfter: after.historyLen,
    activeIndexAfter: after.activeIndex,
    committed:
      after.historyLen > before.historyLen ||
      after.activeIndex !== before.activeIndex
  })
}
