export type EditorShellCacheProps = {
  /** When set, the shell binds to this file instead of reading `location.hash`. */
  pinnedFileId?: string;
  /** False for background cached tabs; disables active-editor bridges. */
  isEditorTabActive?: boolean;
};
