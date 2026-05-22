import { htmlToMarkdown } from './markdownStorage'

/**
 * Ensure a rich text node has a markdown field.
 * If the node has richText:true but no markdown, derive it from text (HTML).
 */
export const ensureMarkdownField = (data) => {
  if (!data) return data
  if (data.richText && typeof data.markdown !== 'string' && typeof data.text === 'string') {
    data.markdown = htmlToMarkdown(data.text)
  }
  return data
}

/**
 * Validate that node data fields are consistent.
 */
export const validateNodeData = (data) => {
  const issues = []
  if (!data) return { valid: true, issues }
  if (data.richText && typeof data.markdown !== 'string' && typeof data.text === 'string') {
    issues.push('richText node missing markdown field')
  }
  if (typeof data.markdown === 'string' && typeof data.text !== 'string') {
    issues.push('markdown present but text cache missing')
  }
  return { valid: issues.length === 0, issues }
}

/**
 * Migrate legacy node data to the normalized format.
 * Returns a new object (does not mutate input).
 */
export const migrateNodeData = (data) => {
  if (!data) return data
  const migrated = { ...data }
  ensureMarkdownField(migrated)
  return migrated
}
