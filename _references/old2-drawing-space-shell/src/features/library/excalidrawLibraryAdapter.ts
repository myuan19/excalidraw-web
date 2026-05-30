import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";
import { CombinedLibraryAdapter } from "./combinedLibraryAdapter";

export const excalidrawLibraryAdapter: LibraryPersistenceAdapter = {
  async load() {
    const data = await CombinedLibraryAdapter.load();
    return { libraryItems: data.libraryItems as never };
  },
  async save({ libraryItems }) {
    const data = await CombinedLibraryAdapter.load();
    await CombinedLibraryAdapter.save({
      libraryItems: libraryItems as never,
      groups: data.groups,
    });
  },
};
