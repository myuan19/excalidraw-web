/**
 * MindMap Vue runtime diagnostics — off in production unless explicitly enabled.
 */

export function isMindmapDevDebugEnabled() {
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  if (typeof window !== 'undefined' && window.__MINDMAP_DEBUG__ === true) {
    return true
  }
  try {
    const params = new URLSearchParams(window.location.search)
    return (
      params.get('mindmapDebug') === '1' ||
      params.get('mindmapLoadDebug') === '1' ||
      window.localStorage.getItem('mindmapDebug') === '1' ||
      window.localStorage.getItem('mindmapLoadDebug') === '1'
    )
  } catch (error) {
    return false
  }
}

export function mindmapDevDebug(scope, label, data) {
  if (!isMindmapDevDebugEnabled()) {
    return
  }
  const payload = {
    t: Math.round(performance.now()),
    ...(data || {})
  }
  console.log(`[DEBUG] ${scope} | ${label}`, payload)
}
