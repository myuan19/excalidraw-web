function buildNodeBackground(styleSource) {
  const fillColor = styleSource.fillColor || 'transparent'
  const gradientStyle = styleSource.gradientStyle
  if (!gradientStyle) {
    return fillColor
  }
  const startColor = styleSource.startColor || fillColor
  const endColor = styleSource.endColor || fillColor
  const startDir = styleSource.startDir || [0, 0]
  const endDir = styleSource.endDir || [0, 1]
  const dx = endDir[0] - startDir[0]
  const dy = endDir[1] - startDir[1]
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
  return `linear-gradient(${angle}deg, ${startColor}, ${endColor})`
}

function buildNodePreviewCss(styleSource, { isDark = false } = {}) {
  if (!styleSource) {
    return {}
  }

  const borderWidth = Number(styleSource.borderWidth || 0)
  const borderColor = styleSource.borderColor || 'transparent'
  const fillColor = styleSource.fillColor || 'transparent'

  return {
    color: styleSource.color || (isDark ? '#d4d4d4' : '#37352f'),
    background: buildNodeBackground({
      fillColor,
      gradientStyle: styleSource.gradientStyle,
      startColor: styleSource.startColor,
      endColor: styleSource.endColor,
      startDir: styleSource.startDir,
      endDir: styleSource.endDir
    }),
    border: `${borderWidth}px solid ${borderColor}`,
    borderRadius: `${Number(styleSource.borderRadius || 6)}px`,
    fontFamily: styleSource.fontFamily || 'inherit',
    fontSize: `${Number(styleSource.fontSize || 14)}px`,
    fontWeight: styleSource.fontWeight || 'normal',
    fontStyle: styleSource.fontStyle || 'normal',
    textDecoration: styleSource.textDecoration || 'none',
    padding: `${Number(styleSource.paddingY || 8)}px ${Number(
      styleSource.paddingX || 18
    )}px`,
    textAlign: styleSource.textAlign || 'left'
  }
}

export function buildNodeDomPreviewStyle(node, { isDark = false } = {}) {
  if (!node || typeof node.getStyle !== 'function') {
    return {}
  }

  const gradientStyle = node.getStyle('gradientStyle', false)
  return buildNodePreviewCss(
    {
      borderWidth: node.getStyle('borderWidth', false),
      borderColor: node.getStyle('borderColor', false),
      fillColor: node.getStyle('fillColor', false),
      gradientStyle,
      startColor: node.getStyle('startColor', false),
      endColor: node.getStyle('endColor', false),
      startDir: node.getStyle('startDir', false),
      endDir: node.getStyle('endDir', false),
      color: node.getStyle('color', false),
      borderRadius: node.getStyle('borderRadius', false),
      fontFamily: node.getStyle('fontFamily', false),
      fontSize: node.getStyle('fontSize', false),
      fontWeight: node.getStyle('fontWeight', false),
      fontStyle: node.getStyle('fontStyle', false),
      textDecoration: node.getStyle('textDecoration', false),
      paddingY: node.getStyle('paddingY', false),
      paddingX: node.getStyle('paddingX', false),
      textAlign: node.getStyle('textAlign', false)
    },
    { isDark }
  )
}

export function buildNodeDomPreviewStyleFromState(style, { isDark = false } = {}) {
  return buildNodePreviewCss(style, { isDark })
}

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
