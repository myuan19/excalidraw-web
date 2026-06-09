/**
 * 编辑历史分层入口
 *
 * - core: 记录 / 预览包装 / 彩虹线
 * - dragSession: 连续操作（滑条）暂停历史
 * - themeEdit: 全局 themeConfig / margin / 外框
 * - nodeStyleEdit: 单节点样式
 * - treeSnapshot: 纯树快照（存储、大纲 diff）
 */

export {
  recordEditHistory,
  withHistoryPreview,
  applyRainbowLinesConfig
} from './core'

export { beginDragSession, endDragSession } from './dragSession'

export {
  normalizeThemeFieldValue,
  previewThemeField,
  commitThemeField,
  persistThemeConfig,
  readThemeMargin,
  buildThemeMarginConfig,
  previewThemeMargin,
  commitThemeMargin,
  previewOuterFramePadding,
  commitOuterFramePadding
} from './themeEdit'

export {
  previewNodeStyleOnNodes,
  commitNodeStyleOnNodes,
  commitNodeStylesOnNodes
} from './nodeStyleEdit'

export {
  normalizeMindMapTreeRoot,
  getMindMapTreeFingerprint
} from './treeSnapshot'

