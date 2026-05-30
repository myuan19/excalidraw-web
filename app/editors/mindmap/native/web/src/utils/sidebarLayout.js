import { isHostMode } from '@/utils/hostBridge'

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
