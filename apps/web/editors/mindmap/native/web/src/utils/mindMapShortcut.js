/**
 * 侧栏 / 全屏大纲 / 画布节点编辑区与 mindMap 快捷键共用同一套启用判断。
 */
export function createMindMapShortcutEnableCheck(getMindMap) {
  return function customCheckEnableShortcut(e) {
    const target = e.target
    if (!target) {
      return false
    }
    if (target === document.body) {
      return true
    }
    if (target.closest) {
      if (target.closest('.sidebarContainer')) {
        return true
      }
      if (target.closest('.outlineEditContainer')) {
        return true
      }
      if (target.closest('.sidebarTriggerContainer')) {
        return true
      }
    }
    const mindMap = typeof getMindMap === 'function' ? getMindMap() : getMindMap
    if (mindMap && mindMap.editNodeClassList) {
      for (let i = 0; i < mindMap.editNodeClassList.length; i++) {
        const cur = mindMap.editNodeClassList[i]
        if (target.classList && target.classList.contains(cur)) {
          return true
        }
      }
    }
    return false
  }
}
