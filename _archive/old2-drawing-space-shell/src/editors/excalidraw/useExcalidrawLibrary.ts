import { useHandleLibrary } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CombinedLibraryAdapter } from "@/features/library";
import { autoCreateGroupFromUrlImport } from "@/features/library/libraryUrlGroups";
import { excalidrawLibraryAdapter } from "@/features/library/excalidrawLibraryAdapter";

type LibraryUrlImportDetail = {
  libraryUrl: string;
  addedItemIds: string[];
};

export function useExcalidrawLibrary(excalidrawAPI: ExcalidrawImperativeAPI | null) {
  useHandleLibrary({
    excalidrawAPI,
    adapter: excalidrawLibraryAdapter,
    onLibraryUrlImport: async ({ libraryUrl, addedItemIds }: LibraryUrlImportDetail) => {
      const data = await CombinedLibraryAdapter.load();
      const groups = autoCreateGroupFromUrlImport(data.groups ?? [], libraryUrl, addedItemIds);
      await CombinedLibraryAdapter.save({
        libraryItems: data.libraryItems,
        groups,
      });
    },
  } as Parameters<typeof useHandleLibrary>[0]);
}
