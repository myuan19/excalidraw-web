/** 侧栏节点预览区背景：与画布 themeConfig 一致 */
export function buildCanvasStageStyle(mindMap, { isDark = false } = {}) {
  if (!mindMap || typeof mindMap.getThemeConfig !== 'function') {
    return {
      backgroundColor: isDark ? '#262a2e' : '#f8fafc'
    }
  }
  const config = mindMap.getThemeConfig() || {}
  const backgroundColor =
    config.backgroundColor || (isDark ? '#262a2e' : '#ffffff')
  const style = {
    backgroundColor
  }
  const backgroundImage = config.backgroundImage
  if (backgroundImage && backgroundImage !== 'none') {
    const repeat = config.backgroundRepeat || 'no-repeat'
    const position = config.backgroundPosition || 'center center'
    const size = config.backgroundSize || 'cover'
    style.backgroundImage = `url(${backgroundImage})`
    style.backgroundRepeat = repeat
    style.backgroundPosition = position
    style.backgroundSize = size
  } else if (!backgroundImage || backgroundImage === 'none') {
    style.backgroundImage = isDark
      ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0) 0 0 / 16px 16px'
      : 'radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0) 0 0 / 16px 16px'
  }
  return style
}
