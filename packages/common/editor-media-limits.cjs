/**
 * Node / MindMap webpack require() only — do not import from browser/Vite.
 * Keep in sync with packages/common/src/editorMediaLimits.ts (EDITOR_MEDIA_LIMITS).
 */
const limits = {
  maxFileBytes: 8 * 1024 * 1024,
  maxDimension: 8192,
};

module.exports = limits;
