import React, { memo, useEffect, useState } from "react";

import type { ExcalidrawElement, NonDeleted } from "@excalidraw/element/types";

import { useTransition } from "../hooks/useTransition";

import {
  isLibraryReorderDragOver,
  resolveGridGapDropTarget,
  type LibraryReorderDropIndicator,
} from "./libraryReorderDrop";
import { EmptyLibraryUnit, LibraryUnit } from "./LibraryUnit";

import type { SvgCache } from "../hooks/useLibraryItemSvg";
import type { LibraryItem } from "../types";
import type { ReactNode } from "react";

export type { LibraryReorderDropIndicator };

type LibraryOrPendingItem = readonly (
  | LibraryItem
  | { id: null; elements: readonly NonDeleted<ExcalidrawElement>[] }
)[];

interface Props {
  items: LibraryOrPendingItem;
  onClick: (id: LibraryItem["id"] | null) => void;
  onItemSelectToggle: (id: LibraryItem["id"], event: React.MouseEvent) => void;
  onItemDrag: (id: LibraryItem["id"], event: React.DragEvent) => void;
  isItemSelected: (id: LibraryItem["id"] | null) => boolean;
  svgCache: SvgCache;
  itemsRenderedPerBatch: number;
  enableLibraryReorder?: boolean;
  onLibraryReorder?: (
    draggedId: string,
    targetId: string,
    placeAfter: boolean,
  ) => void;
  reorderDropIndicator?: LibraryReorderDropIndicator | null;
  onReorderDragSourceId?: (id: string | null) => void;
}

export const LibraryMenuSectionGrid = ({
  children,
  enableLibraryReorder,
  onReorderHoverChange,
  reorderDragSourceId,
}: {
  children: ReactNode;
  enableLibraryReorder?: boolean;
  onReorderHoverChange?: (
    target: LibraryReorderDropIndicator | null,
  ) => void;
  reorderDragSourceId?: string | null;
}) => {
  const onDragOver = (e: React.DragEvent) => {
    if (!enableLibraryReorder || !onReorderHoverChange) {
      return;
    }
    if (!isLibraryReorderDragOver(e)) {
      return;
    }
    e.preventDefault();
    const resolved = resolveGridGapDropTarget(
      e.target,
      e.clientX,
      e.clientY,
    );
    if (
      !resolved ||
      (reorderDragSourceId && resolved.targetId === reorderDragSourceId)
    ) {
      onReorderHoverChange(null);
      return;
    }
    onReorderHoverChange(resolved);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!enableLibraryReorder || !onReorderHoverChange) {
      return;
    }
    const grid = e.currentTarget as HTMLElement;
    if (!grid.contains(e.relatedTarget as Node)) {
      onReorderHoverChange(null);
    }
  };

  const onDrop = () => {
    onReorderHoverChange?.(null);
  };

  return (
    <div
      className="library-menu-items-container__grid"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
};

export const LibraryMenuSection = memo(
  ({
    items,
    onItemSelectToggle,
    onItemDrag,
    isItemSelected,
    onClick,
    svgCache,
    itemsRenderedPerBatch,
    enableLibraryReorder,
    onLibraryReorder,
    reorderDropIndicator,
    onReorderDragSourceId,
  }: Props) => {
    const [, startTransition] = useTransition();
    const [index, setIndex] = useState(0);

    useEffect(() => {
      if (index < items.length) {
        startTransition(() => {
          setIndex(index + itemsRenderedPerBatch);
        });
      }
    }, [index, items.length, startTransition, itemsRenderedPerBatch]);

    return (
      <>
        {items.map((item, i) => {
          return i < index ? (
            <LibraryUnit
              elements={item?.elements}
              isPending={!item?.id && !!item?.elements}
              onClick={onClick}
              svgCache={svgCache}
              id={item?.id}
              selected={isItemSelected(item.id)}
              onToggle={onItemSelectToggle}
              onDrag={onItemDrag}
              name={"name" in item ? item.name : undefined}
              enableLibraryReorder={enableLibraryReorder}
              onLibraryReorder={onLibraryReorder}
              reorderDropIndicator={reorderDropIndicator}
              onReorderDragSourceId={onReorderDragSourceId}
              key={item?.id ?? i}
            />
          ) : (
            <EmptyLibraryUnit key={i} />
          );
        })}
      </>
    );
  },
);
