export type EditorShellCacheProps = {
  /** When set, the shell binds to this file instead of reading `location.hash`. */
  pinnedFileId?: string;
  /**
   * True when this pane is the foreground tab in EditorPaneStack.
   * Shells defer heavy runtime boot until first foreground and resume via
   * `useEditorPaneLifecycle`.
   */
  isPaneForeground?: boolean;
  /**
   * Transient Excalidraw session for `#addLibrary=` deep links when no file tab
   * is open (desktop tab cache / web cold start).
   */
  libraryImportOnly?: boolean;
};

export function resolvePaneForeground(props: EditorShellCacheProps): boolean {
  return props.isPaneForeground ?? true;
}
