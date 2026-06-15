import { normalizeAiOrganizeNode } from './aiTreeJson'
import { createAiOperationPermissionError } from './aiOperationPolicy'

const VALID_OPS = new Set([
  'update_current',
  'add_child',
  'update_node',
  'delete_node',
  'done'
])

function normalizeTextPayload(raw) {
  const textPayload = raw.text || raw.content || raw
  if (typeof textPayload === 'string') {
    return {
      text: textPayload,
      note: raw.note,
      hyperlink: raw.hyperlink
    }
  }
  return {
    ...textPayload,
    note: raw.note ?? textPayload.note,
    hyperlink: raw.hyperlink ?? textPayload.hyperlink
  }
}

function normalizeRef(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeOperation(raw, line, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid ai operation')
  }
  const op = normalizeRef(raw.op)
  if (!VALID_OPS.has(op)) {
    throw new Error(`unsupported ai operation: ${op}`)
  }
  if (Array.isArray(options.allowedOps) && !options.allowedOps.includes(op)) {
    throw createAiOperationPermissionError({
      op
    })
  }
  const opId = normalizeRef(raw.op_id || raw.opId || raw.event_id || raw.eventId)
  const base = {
    op,
    opId,
    rawLine: line
  }
  if (op === 'done') {
    return base
  }
  if (op === 'delete_node') {
    const id = normalizeRef(raw.id || raw.target || raw.ref)
    if (!id) {
      throw new Error('delete_node requires id')
    }
    return {
      ...base,
      id
    }
  }
  if (op === 'add_child') {
    const id = normalizeRef(raw.id)
    if (!id) {
      throw new Error('add_child requires id')
    }
    const node = normalizeAiOrganizeNode(normalizeTextPayload(raw), false, {
      allowInlineStyles: !!options.allowInlineStyles
    })
    return {
      ...base,
      id,
      parent: normalizeRef(raw.parent, 'current'),
      node: {
        data: node.data,
        children: []
      }
    }
  }
  const data = normalizeAiOrganizeNode(normalizeTextPayload(raw), false, {
    allowInlineStyles: !!options.allowInlineStyles
  }).data
  return {
    ...base,
    id: op === 'update_current' ? 'current' : normalizeRef(raw.id || raw.target),
    data
  }
}

function shouldSkipLine(line) {
  return (
    !line ||
    line === '[DONE]' ||
    line === '```' ||
    line === '```json' ||
    line === '```ndjson' ||
    line.startsWith('//')
  )
}

function parseLine(line, options) {
  const normalized = line.replace(/^data:\s*/, '').trim()
  if (shouldSkipLine(normalized)) {
    return null
  }
  return normalizeOperation(JSON.parse(normalized), normalized, options)
}

export function parseAiOperationStreamChunk(
  content,
  {
    offset = 0,
    final = false,
    allowInlineStyles = false,
    allowedOps = null
  } = {}
) {
  const raw = String(content || '')
  const operations = []
  let cursor = Math.max(0, Math.min(offset, raw.length))
  while (cursor < raw.length) {
    const newlineIndex = raw.indexOf('\n', cursor)
    if (newlineIndex === -1 && !final) {
      break
    }
    const end = newlineIndex === -1 ? raw.length : newlineIndex
    const line = raw.slice(cursor, end).trim()
    if (line) {
      const operation = parseLine(line, {
        allowInlineStyles,
        allowedOps
      })
      if (operation) {
        operations.push(operation)
      }
    }
    cursor = newlineIndex === -1 ? raw.length : newlineIndex + 1
  }
  return {
    operations,
    offset: cursor
  }
}

export function getAiOperationKey(operation) {
  if (operation.opId) {
    return operation.opId
  }
  if (operation.op === 'add_child') {
    return `add_child:${operation.id}`
  }
  return operation.rawLine
}
