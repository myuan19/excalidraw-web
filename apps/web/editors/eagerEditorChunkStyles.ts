/**
 * Pull lazy editor-shell CSS into the main bundle.
 *
 * Desktop loads the SPA via editorhub:// — Vite's dynamic CSS preload for lazy
 * chunks can fail on custom protocols and crashes EditorPaneErrorBoundary.
 */
import "../components/ArchivePanel.scss";
import "../components/ExcalToolbar.scss";
import "./mindmap/MindMapEditorShell.scss";
