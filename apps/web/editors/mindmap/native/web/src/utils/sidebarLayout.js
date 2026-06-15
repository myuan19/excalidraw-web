import { isHostMode } from '@/utils/hostBridge'

export {
  SIDEBAR_UI_Z_INDEX_BASE,
  SIDEBAR_UI_Z_INDEX_TRIGGER
} from '@/utils/mindMapEditorLayers'

/** 侧栏面板宽度（px） */
export const SIDEBAR_PANEL_WIDTH = 300

/** 竖排触发器宽度（px） */
export const SIDEBAR_TRIGGER_WIDTH = 60

/** 右侧 Sidebar / SidebarTrigger 的 top，跟随实际工具栏高度 */
export function getSidebarTopMargin() {
  const toolbar = document.querySelector('.toolbarContainer .toolbar')
  if (toolbar) {
    const bottom = toolbar.getBoundingClientRect().bottom
    if (bottom > 0) {
      return Math.round(bottom + 10)
    }
  }
  return isHostMode() ? 78 : 110
}

export const SIDEBAR_BOTTOM_MARGIN = 80
