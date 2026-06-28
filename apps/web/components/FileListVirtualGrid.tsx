import {
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  computeFileListColumnCount,
  computeFileListColumnWidth,
  estimateFileListRowHeight,
  FILE_LIST_GRID_GAP_PX,
  FILE_LIST_GRID_HORIZONTAL_PADDING_PX,
} from "../lib/fileListGridLayout";

import type { ServerFile } from "../data/ServerSync";

type FileListVirtualGridProps = {
  scrollRef: RefObject<HTMLElement | null>;
  gridRef?: RefObject<HTMLDivElement | null>;
  files: ServerFile[];
  listKey: string;
  gridClassName: string;
  leadingSlot?: ReactNode;
  renderFile: (file: ServerFile, index: number) => ReactNode;
  onVisibleDomCountChange?: (count: number) => void;
};

export function FileListVirtualGrid({
  scrollRef,
  gridRef,
  files,
  listKey,
  gridClassName,
  leadingSlot,
  renderFile,
  onVisibleDomCountChange,
}: FileListVirtualGridProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const measure = () => {
      setContainerWidth(scrollEl.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollRef, listKey]);

  const columnCount = useMemo(
    () => computeFileListColumnCount(containerWidth || 960),
    [containerWidth],
  );
  const columnWidth = useMemo(
    () => computeFileListColumnWidth(containerWidth || 960, columnCount),
    [columnCount, containerWidth],
  );
  const rowCount = Math.ceil(files.length / columnCount);
  const estimatedRowHeight = estimateFileListRowHeight(columnWidth);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 2,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const visibleDomCount =
    virtualRows.length * columnCount + (leadingSlot ? 1 : 0);

  useLayoutEffect(() => {
    onVisibleDomCountChange?.(visibleDomCount);
  }, [onVisibleDomCountChange, visibleDomCount]);

  return (
    <div
      ref={gridRef}
      className={gridClassName}
      key={listKey}
      data-virtualized="true"
      data-file-count={files.length}
      data-column-count={columnCount}
    >
      {leadingSlot ? (
        <div className="filelist__virtual-leading">{leadingSlot}</div>
      ) : null}
      <div
        className="filelist__virtual-spacer"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const rowStartIndex = virtualRow.index * columnCount;
          const rowFiles = files.slice(rowStartIndex, rowStartIndex + columnCount);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="filelist__virtual-row"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${FILE_LIST_GRID_GAP_PX}px`,
                paddingInline: `${FILE_LIST_GRID_HORIZONTAL_PADDING_PX / 2}px`,
                boxSizing: "border-box",
              }}
            >
              {rowFiles.map((file, columnIndex) =>
                renderFile(file, rowStartIndex + columnIndex),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
