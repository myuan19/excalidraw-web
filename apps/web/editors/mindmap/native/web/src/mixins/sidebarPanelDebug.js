import { sidebarDebug, sidebarDebugPanelWatch } from '@/utils/sidebarDebug'

export default {
  methods: {
    logSidebarPanelWatch(panelKey, val, oldVal, extra = {}) {
      sidebarDebugPanelWatch(panelKey, val, oldVal, {
        hasSidebarRef: !!this.$refs.sidebar,
        show: this.$refs.sidebar ? this.$refs.sidebar.show : null,
        activeSidebar: this.activeSidebar || null,
        ...extra
      })
    },

    logSidebarPanelMounted(panelKey) {
      sidebarDebug('panel mounted', {
        panelKey,
        activeSidebar: this.activeSidebar || null,
        show: this.$refs.sidebar ? this.$refs.sidebar.show : null
      })
    },

    logSidebarPanelCreated(panelKey) {
      sidebarDebug('panel created', { panelKey })
    }
  }
}
