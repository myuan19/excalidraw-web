import clsx from "clsx";
import { useState } from "react";

import { libraryItemsAtom } from "../data/library";
import { useAtom } from "../editor-jotai";
import { useLibraryCache } from "../hooks/useLibraryItemSvg";
import { t } from "../i18n";

import { useApp, useExcalidrawSetAppState } from "./App";
import ConfirmDialog from "./ConfirmDialog";
import { TrashIcon } from "./icons";

import type Library from "../data/library";
import type { LibraryItem, LibraryItems, UIAppState } from "../types";

export const LibraryHeaderActionsBar: React.FC<{
  setAppState: React.Component<any, UIAppState>["setState"];
  selectedItems: LibraryItem["id"][];
  library: Library;
  onRemoveFromLibrary: () => void;
  resetLibrary: () => void;
  className?: string;
}> = ({
  setAppState,
  selectedItems,
  library,
  onRemoveFromLibrary,
  resetLibrary,
  className,
}) => {
  const [libraryItemsData] = useAtom(libraryItemsAtom);
  const [showRemoveLibAlert, setShowRemoveLibAlert] = useState(false);

  const itemsSelected = !!selectedItems.length;
  const items = itemsSelected
    ? libraryItemsData.libraryItems.filter((item) =>
        selectedItems.includes(item.id),
      )
    : libraryItemsData.libraryItems;
  const resetLabel = itemsSelected
    ? t("buttons.remove")
    : t("buttons.resetLibrary");

  const renderConfirmDialog = () => {
    const content = selectedItems.length
      ? t("alerts.removeItemsFromsLibrary", { count: selectedItems.length })
      : t("alerts.resetLibrary");
    const title = selectedItems.length
      ? t("confirmDialog.removeItemsFromLib")
      : t("confirmDialog.resetLibrary");
    return (
      <ConfirmDialog
        onConfirm={() => {
          if (selectedItems.length) {
            onRemoveFromLibrary();
          } else {
            resetLibrary();
          }
          setShowRemoveLibAlert(false);
        }}
        onCancel={() => setShowRemoveLibAlert(false)}
        title={title}
      >
        <p>{content}</p>
      </ConfirmDialog>
    );
  };

  return (
    <div className={clsx("library-actions", className)}>
      <div className="library-actions__row" role="toolbar">
        {!!items.length && (
          <button
            type="button"
            className="library-actions__btn library-actions__btn--danger"
            onClick={() => setShowRemoveLibAlert(true)}
            title={resetLabel}
            aria-label={resetLabel}
          >
            <span className="library-actions__icon">{TrashIcon}</span>
          </button>
        )}
      </div>
      {showRemoveLibAlert && renderConfirmDialog()}
    </div>
  );
};

/** Convenience wrapper that wires remove/reset callbacks from app context. */
export const LibraryDropdownMenu = ({
  selectedItems,
  onSelectItems,
  className,
}: {
  selectedItems: LibraryItem["id"][];
  onSelectItems: (id: LibraryItem["id"][]) => void;
  className?: string;
}) => {
  const { library } = useApp();
  const { clearLibraryCache, deleteItemsFromLibraryCache } = useLibraryCache();
  const setAppState = useExcalidrawSetAppState();

  const [libraryItemsData] = useAtom(libraryItemsAtom);

  const removeFromLibrary = async (libraryItems: LibraryItems) => {
    const nextItems = libraryItems.filter(
      (item) => !selectedItems.includes(item.id),
    );
    library.setLibrary(nextItems).catch(() => {
      setAppState({ errorMessage: t("alerts.errorRemovingFromLibrary") });
    });
    deleteItemsFromLibraryCache(selectedItems);
    onSelectItems([]);
  };

  const resetLibrary = () => {
    library.resetLibrary();
    clearLibraryCache();
  };

  return (
    <LibraryHeaderActionsBar
      setAppState={setAppState}
      selectedItems={selectedItems}
      library={library}
      onRemoveFromLibrary={() =>
        removeFromLibrary(libraryItemsData.libraryItems)
      }
      resetLibrary={resetLibrary}
      className={className}
    />
  );
};
