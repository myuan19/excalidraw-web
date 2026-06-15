import { editHistoryDebug } from '@/utils/editHistoryDebug'

export function recordEditHistory(mindMap) {
  if (!mindMap || !mindMap.command || mindMap.command.isPause) {
    editHistoryDebug('recordEditHistory skipped', {
      hasMindMap: !!mindMap,
      isPause: mindMap && mindMap.command ? mindMap.command.isPause : null
    })
    return
  }
  editHistoryDebug('recordEditHistory', {
    index: mindMap.command.activeHistoryIndex,
    length: mindMap.command.history.length
  })
  mindMap.command.addHistory()
}

export function withHistoryPreview(mindMap, fn) {
  if (!mindMap || !mindMap.command) {
    return typeof fn === 'function' ? fn() : undefined
  }
  const wasPaused = mindMap.command.isPause
  if (!wasPaused) {
    mindMap.command.pause()
  }
  try {
    return typeof fn === 'function' ? fn() : undefined
  } finally {
    if (!wasPaused) {
      mindMap.command.recovery()
    }
  }
}

export function applyRainbowLinesConfig(mindMap, config) {
  if (!mindMap) return
  mindMap.updateConfig({ rainbowLinesConfig: config })
  if (mindMap.rainbowLines) {
    mindMap.rainbowLines.updateRainLinesConfig(config)
  }
  recordEditHistory(mindMap)
}
