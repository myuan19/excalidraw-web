/**
 * 侧栏面板在撤销/重做后同步本地表单状态。
 */
import { editHistoryDebug } from '@/utils/editHistoryDebug'

export default {
  created() {
    this.$bus.$on('edit_history_restored', this.onEditHistoryRestored)
  },
  beforeDestroy() {
    this.$bus.$off('edit_history_restored', this.onEditHistoryRestored)
  },
  methods: {
    onEditHistoryRestored(index, length) {
      editHistoryDebug('sidebarHistorySync', {
        panel: this.$options.name || 'anonymous',
        index,
        length,
        hasSync: typeof this.syncFromEditHistory === 'function'
      })
      if (typeof this.syncFromEditHistory !== 'function') {
        return
      }
      this.$nextTick(() => {
        this.syncFromEditHistory()
      })
    }
  }
}
