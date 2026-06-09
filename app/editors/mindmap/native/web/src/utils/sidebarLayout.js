import { isHostMode } from '@/utils/hostBridge'

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

/**
 * 侧栏 UI 基础层级：高于顶部浮动工具栏、节点编辑框(1000)、浮动工具条(2000)、演示模式(10001)。
 */
export const SIDEBAR_UI_Z_INDEX_BASE = 10100

/** 竖排触发器略高于侧栏面板，避免贴边时被裁切 */
export const SIDEBAR_UI_Z_INDEX_TRIGGER = SIDEBAR_UI_Z_INDEX_BASE + 1
