import { editHistoryDebug } from '@/utils/editHistoryDebug'

/** 滑条等连续操作：按下暂停历史，松手后由提交方写入一条记录 */
export function beginDragSession(mindMap, meta = {}) {
  if (!mindMap || !mindMap.command || mindMap.command.isPause) {
    return false
  }
  mindMap.command.pause()
  editHistoryDebug('dragSession begin', meta)
  return true
}

export function endDragSession(mindMap, meta = {}) {
  if (!mindMap || !mindMap.command || !mindMap.command.isPause) {
    return
  }
  mindMap.command.recovery()
  editHistoryDebug('dragSession end', meta)
}
