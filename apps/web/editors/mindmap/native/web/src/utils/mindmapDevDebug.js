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

function stringifyDebugPayload(value) {
  const seen = []
  try {
    return JSON.stringify(value, (key, item) => {
      if (typeof item === 'function') {
        return `[Function ${item.name || 'anonymous'}]`
      }
      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack
        }
      }
      if (item && typeof item === 'object') {
        if (seen.includes(item)) {
          return '[Circular]'
        }
        seen.push(item)
      }
      return item
    })
  } catch (error) {
    return '[Unserializable debug payload]'
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
  console.log(`[DEBUG] ${scope} | ${label} ${stringifyDebugPayload(payload)}`)
}
