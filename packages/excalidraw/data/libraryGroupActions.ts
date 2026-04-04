/**
 * Registry for library group action callbacks.
 * The app layer registers its enhancer functions here so that the
 * core excalidraw components can call them without a direct import.
 */

export interface LibraryGroupActions {
  toggleGroupCollapsed: (groupId: string) => void;
  renameGroup: (groupId: string, newName: string) => void;
  deleteGroup: (groupId: string) => void;
  createGroup: (name: string, itemIds?: string[]) => void;
  reorderGroup: (
    sourceId: string,
    targetId: string,
    placeAfter: boolean,
  ) => void;
  /** Insert group at gap index `k` (0 = before first group, `n` = after last). */
  reorderGroupToGap: (sourceId: string, gapIndex: number) => void;
  reorderItemWithinGroups: (
    draggedId: string,
    targetId: string,
    /** When provided, must match the order from reorderPublicBlock so commit does not revert. */
    orderedLibraryItems?: readonly {
      id: string;
      status: string;
      elements?: readonly unknown[];
      created?: number;
      name?: string;
    }[],
    /** true = insert after target (right half / gap from left); false = before (left half). */
    placeAfter?: boolean,
  ) => void;
  moveItem: (
    itemId: string,
    opts?: {
      status?: string;
      groupId?: string;
      targetItemId?: string;
      placeAfter?: boolean;
    },
  ) => void;
  findGroupForItem: (
    groups: Array<{ id: string; name: string; itemIds: string[] }>,
    itemId: string,
  ) => string | null;
}

const noop = () => {};

let registeredActions: LibraryGroupActions = {
  toggleGroupCollapsed: noop,
  renameGroup: noop,
  deleteGroup: noop,
  createGroup: noop,
  reorderGroup: noop,
  reorderGroupToGap: noop,
  reorderItemWithinGroups: noop,
  moveItem: noop,
  findGroupForItem: () => null,
};

export function registerLibraryGroupActions(
  actions: LibraryGroupActions,
): void {
  registeredActions = actions;
}

export function getLibraryGroupActions(): LibraryGroupActions {
  return registeredActions;
}
