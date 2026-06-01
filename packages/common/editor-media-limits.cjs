/**
 * Single source of truth for editor / embed image file size caps (EditorHub).
 * Consumed by @excalidraw/common (TS), MindMap defaultOptions (build-time require), and app import checks.
 */
module.exports = {
  maxFileBytes: 8 * 1024 * 1024,
  maxDimension: 8192,
};
