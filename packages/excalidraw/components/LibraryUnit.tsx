import clsx from "clsx";
import { memo, useRef, useState } from "react";

import { MIME_TYPES } from "@excalidraw/common";

import { useLibraryItemSvg } from "../hooks/useLibraryItemSvg";

import { useEditorInterface } from "./App";
import { CheckboxItem } from "./CheckboxItem";
import { PlusIcon } from "./icons";
import { isLibraryReorderDragOver } from "./libraryReorderDrop";

import "./LibraryUnit.scss";

import type { LibraryReorderDropIndicator } from "./libraryReorderDrop";
import type { LibraryItem } from "../types";
import type { SvgCache } from "../hooks/useLibraryItemSvg";

const LIB_REORDER_PREFIX = "excalidraw-lib-reorder:";

export const LibraryUnit = memo(
  ({
    id,
    elements,
    isPending,
    onClick,
    selected,
    onToggle,
    onDrag,
    svgCache,
    name,
    enableLibraryReorder,
    onLibraryReorder,
    reorderDropIndicator,
    onReorderDragSourceId,
  }: {
    id: LibraryItem["id"] | null;
    elements?: LibraryItem["elements"];
    isPending?: boolean;
    onClick: (id: LibraryItem["id"] | null) => void;
    selected: boolean;
    onToggle: (id: string, event: React.MouseEvent) => void;
    onDrag: (id: string, event: React.DragEvent) => void;
    svgCache: SvgCache;
    name?: string;
    enableLibraryReorder?: boolean;
    onLibraryReorder?: (
      draggedId: string,
      targetId: string,
      placeAfter: boolean,
    ) => void;
    reorderDropIndicator?: LibraryReorderDropIndicator | null;
    onReorderDragSourceId?: (id: string | null) => void;
  }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const unitRootRef = useRef<HTMLDivElement | null>(null);
    const svg = useLibraryItemSvg(id, elements, svgCache, ref);

    const [isHovered, setIsHovered] = useState(false);
    const isMobile = useEditorInterface().formFactor === "phone";

    const adder = isPending && (
      <div className="library-unit__adder">{PlusIcon}</div>
    );

    const showReorderInsertLine =
      !!id &&
      !!reorderDropIndicator &&
      reorderDropIndicator.targetId === id &&
      (!reorderDropIndicator.placeAfter ? "before" : "after");

    const onReorderDragOver = (event: React.DragEvent) => {
      if (!id || !onLibraryReorder) {
        return;
      }
      if (!isLibraryReorderDragOver(event)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    };

    const onReorderDrop = (event: React.DragEvent) => {
      if (!id || !onLibraryReorder) {
        return;
      }
      let draggedId: string | null = null;

      const raw = event.dataTransfer.getData("text/plain");
      if (raw.startsWith(LIB_REORDER_PREFIX)) {
        draggedId = raw.slice(LIB_REORDER_PREFIX.length);
      }
      if (!draggedId) {
        draggedId = event.dataTransfer.getData("text/x-library-item-id");
      }
      if (!draggedId) {
        try {
          const idsJson = event.dataTransfer.getData(
            MIME_TYPES.excalidrawlibIds,
          );
          if (idsJson) {
            const parsed = JSON.parse(idsJson) as { itemIds?: string[] };
            if (parsed.itemIds?.length) {
              draggedId = parsed.itemIds[0];
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!draggedId || draggedId === id) {
        return;
      }
      event.preventDefault();
      const rect = unitRootRef.current?.getBoundingClientRect();
      let placeAfter = false;
      if (rect && rect.width > 0) {
        const x = event.clientX - rect.left;
        placeAfter = x >= rect.width / 2;
      }
      onLibraryReorder(draggedId, id, placeAfter);
      onReorderDragSourceId?.(null);
    };

    return (
      <div
        ref={unitRootRef}
        className={clsx("library-unit", {
          "library-unit__active": elements,
          "library-unit--hover": elements && isHovered,
          "library-unit--selected": selected,
          "library-unit--skeleton": !svg,
        })}
        data-lib-id={id ?? undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={enableLibraryReorder ? onReorderDragOver : undefined}
        onDrop={enableLibraryReorder ? onReorderDrop : undefined}
      >
        {showReorderInsertLine && (
          <div
            className={clsx("library-unit__reorder-line", {
              "library-unit__reorder-line--before":
                showReorderInsertLine === "before",
              "library-unit__reorder-line--after":
                showReorderInsertLine === "after",
            })}
            aria-hidden
          />
        )}
        <div
          className={clsx("library-unit__dragger", {
            "library-unit__pulse": !!isPending,
          })}
          ref={ref}
          draggable={!!elements}
          onClick={
            !!elements || !!isPending
              ? (event) => {
                  if (isPending) {
                    onClick(id);
                    return;
                  }
                  if (!id) {
                    return;
                  }
                  if (event.shiftKey) {
                    onToggle(id, event);
                    return;
                  }
                  onClick(id);
                }
              : undefined
          }
          onDragStart={(event) => {
            if (!id) {
              event.preventDefault();
              return;
            }
            setIsHovered(false);
            event.dataTransfer.setData(
              "text/plain",
              `${LIB_REORDER_PREFIX}${id}`,
            );
            event.dataTransfer.effectAllowed = "move";
            onReorderDragSourceId?.(id);
            onDrag(id, event);
          }}
        />
        {adder}
        {id && elements && (isHovered || isMobile || selected) && (
          <CheckboxItem
            checked={selected}
            onChange={(checked, event) => onToggle(id, event)}
            className="library-unit__checkbox"
          />
        )}
        {name && isHovered && (
          <div className="library-unit__name" title={name}>
            {name}
          </div>
        )}
      </div>
    );
  },
);

export const EmptyLibraryUnit = () => (
  <div className="library-unit library-unit--skeleton" />
);
