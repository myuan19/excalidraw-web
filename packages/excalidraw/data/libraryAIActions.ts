/**
 * Registry for AI actions on library items.
 * The app layer registers its implementation so that core components
 * can invoke AI features without a direct import.
 */

export interface LibraryAIActions {
  generateIconTags: (
    items: Array<{ id: string; elements: readonly unknown[] }>,
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ) => Promise<Map<string, string>>;
}

const noop: LibraryAIActions = {
  generateIconTags: async () => new Map(),
};

let registered: LibraryAIActions = noop;

export function registerLibraryAIActions(actions: LibraryAIActions): void {
  registered = actions;
}

export function getLibraryAIActions(): LibraryAIActions {
  return registered;
}
