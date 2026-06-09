import { Loading } from 'element-ui'
import { mindmapDevDebug } from '@/utils/mindmapDevDebug'

let loadingInstance = null

export const showLoading = (reason = 'unspecified') => {
  if (loadingInstance) {
    mindmapDevDebug('mindmap-loading', 'showLoading close stale instance', {
      reason
    })
    loadingInstance.close()
    loadingInstance = null
  }
  loadingInstance = Loading.service({
    lock: true
  })
  mindmapDevDebug('mindmap-loading', 'showLoading', { reason })
}

export const hideLoading = (reason = 'unspecified') => {
  mindmapDevDebug('mindmap-loading', 'hideLoading', {
    reason,
    hadInstance: !!loadingInstance
  })
  if (loadingInstance) {
    loadingInstance.close()
    loadingInstance = null
  }
}
  