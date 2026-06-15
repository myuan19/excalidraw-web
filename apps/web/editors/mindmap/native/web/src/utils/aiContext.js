import { getStrWithBrFromHtml } from 'simple-mind-map/src/utils'

export const AI_CONTEXT_CHAR_LIMIT = {
  DEFAULT: 5000,
  MIN: 1000,
  MAX: 30000,
  STEP: 1000
}

export function normalizeContextCharLimit(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return AI_CONTEXT_CHAR_LIMIT.DEFAULT
  }
  return Math.max(
    AI_CONTEXT_CHAR_LIMIT.MIN,
    Math.min(AI_CONTEXT_CHAR_LIMIT.MAX, Math.floor(num))
  )
}

export function createEmptyAiChildrenContext(limit = AI_CONTEXT_CHAR_LIMIT.DEFAULT) {
  return {
    text: '',
    nodeCount: 0,
    includedNodeCount: 0,
    usedChars: 0,
    charLimit: normalizeContextCharLimit(limit),
    truncated: false
  }
}

export function buildAiChildrenContext(node, contextCharLimit) {
  const limit = normalizeContextCharLimit(contextCharLimit)
  const children =
    node && node.nodeData && Array.isArray(node.nodeData.children)
      ? node.nodeData.children
      : []
  const lines = []
  let usedChars = 0
  let nodeCount = 0
  let truncated = false

  const appendLine = line => {
    const separatorLen = lines.length > 0 ? 1 : 0
    if (usedChars + separatorLen + line.length > limit) {
      return false
    }
    lines.push(line)
    usedChars += separatorLen + line.length
    return true
  }

  const appendTruncatedLine = (ref, text) => {
    const separatorLen = lines.length > 0 ? 1 : 0
    const available = limit - usedChars - separatorLen
    if (available <= 0) {
      return
    }
    const prefix = `${nodeCount}. [id=${ref}] [deep=-1] `
    const suffix = '...'
    if (available <= prefix.length + suffix.length) {
      appendLine(`[deep=-1] ...`.slice(0, available))
      return
    }
    appendLine(
      `${prefix}${text.slice(
        0,
        available - prefix.length - suffix.length
      )}${suffix}`
    )
  }

  const walk = (list, parentRef, deep) => {
    if (truncated || !Array.isArray(list)) return
    list.forEach((child, index) => {
      if (truncated) return
      const ref = parentRef ? `${parentRef}-${index + 1}` : `child-${index + 1}`
      const text = getStrWithBrFromHtml(
        (child && child.data && child.data.text) || ''
      ).trim()
      nodeCount += 1
      const line = `${nodeCount}. [id=${ref}] [deep=${deep}] ${text}`
      if (!appendLine(line)) {
        appendTruncatedLine(ref, text)
        truncated = true
        return
      }
      walk(child.children, ref, deep + 1)
    })
  }

  walk(children, '', 1)

  return {
    text: lines.join('\n'),
    nodeCount,
    includedNodeCount: lines.filter(line => line.includes('[id=')).length,
    usedChars,
    charLimit: limit,
    truncated
  }
}
