import { MIME_TYPES } from "@excalidraw/common";

export type LibraryReorderDropIndicator = {
  targetId: string;
  placeAfter: boolean;
};

/** Grid gaps: some browsers omit `text/x-library-item-id` during dragover; allow drop for library payloads. */
export function isLibraryItemDragOver(e: React.DragEvent) {
  const types = [...e.dataTransfer.types];
  const has = (mime: string) =>
    types.some((t) => t.toLowerCase() === mime.toLowerCase());
  return (
    has("text/x-library-item-id") ||
    has(MIME_TYPES.excalidrawlibIds) ||
    has(MIME_TYPES.excalidrawlib)
  );
}

/** Reorder handle uses `text/plain`; tiles may use library MIME types. */
export function isLibraryReorderDragOver(e: React.DragEvent) {
  const types = [...e.dataTransfer.types];
  const has = (mime: string) =>
    types.some((t) => t.toLowerCase() === mime.toLowerCase());
  return (
    has("text/plain") ||
    has("text/x-library-item-id") ||
    has(MIME_TYPES.excalidrawlibIds) ||
    has(MIME_TYPES.excalidrawlib)
  );
}

/**
 * When the pointer is on the last tile in a row (rightmost in that row) but
 * either (1) on its right half / trailing gap, or (2) in the empty strip to
 * the right of that tile up to the grid edge, the expanded-cell hit test can
 * miss. In that case we still want "insert after" that tile.
 */
function resolveLastInRowRightOrTrailingBlank(
  grid: HTMLElement,
  clientX: number,
  clientY: number,
): { targetId: string; placeAfter: boolean } | null {
  const gridRect = grid.getBoundingClientRect();
  if (
    clientX < gridRect.left ||
    clientX > gridRect.right ||
    clientY < gridRect.top ||
    clientY > gridRect.bottom
  ) {
    return null;
  }

  const list = grid.querySelectorAll<HTMLElement>(".library-unit[data-lib-id]");
  const rowUnits: Array<{ el: HTMLElement; rect: DOMRect }> = [];
  for (const u of list) {
    const r = u.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) {
      rowUnits.push({ el: u, rect: r });
    }
  }
  if (rowUnits.length === 0) {
    return null;
  }

  const rightmost = rowUnits.reduce((a, b) =>
    a.rect.right >= b.rect.right ? a : b,
  );
  const r = rightmost.rect;
  const id = rightmost.el.dataset.libId;
  if (!id) {
    return null;
  }

  const midX = r.left + r.width / 2;
  const inRightHalf = clientX >= midX && clientX <= r.right;
  const inBlankAfter = clientX > r.right && clientX <= gridRect.right;

  if (inRightHalf || inBlankAfter) {
    return { targetId: id, placeAfter: true };
  }

  return null;
}

export function resolveGridGapDropTarget(
  eventTarget: EventTarget | null,
  clientX: number,
  clientY: number,
): { targetId: string; placeAfter: boolean } | null {
  const grid = (eventTarget as Element | null)?.closest?.(
    ".library-menu-items-container__grid",
  ) as HTMLElement | null;
  if (!grid) {
    return null;
  }

  const columnGap =
    parseFloat(getComputedStyle(grid).columnGap || "") ||
    parseFloat(getComputedStyle(grid).gap || "") ||
    0;
  const rowGap =
    parseFloat(getComputedStyle(grid).rowGap || "") ||
    parseFloat(getComputedStyle(grid).gap || "") ||
    0;

  let bestMatch:
    | {
        targetId: string;
        placeAfter: boolean;
        score: number;
      }
    | null = null;

  for (const unit of grid.querySelectorAll<HTMLElement>(
    ".library-unit[data-lib-id]",
  )) {
    const targetId = unit.dataset.libId;
    if (!targetId) {
      continue;
    }
    const rect = unit.getBoundingClientRect();
    const left = rect.left - columnGap / 2;
    const right = rect.right + columnGap / 2;
    const top = rect.top - rowGap / 2;
    const bottom = rect.bottom + rowGap / 2;

    if (
      clientX < left ||
      clientX > right ||
      clientY < top ||
      clientY > bottom
    ) {
      continue;
    }

    const placeAfter = clientX >= rect.left + rect.width / 2;
    const score =
      Math.abs(clientY - (rect.top + rect.height / 2)) * 1000 +
      Math.abs(clientX - (rect.left + rect.width / 2));

    if (!bestMatch || score < bestMatch.score) {
      bestMatch = {
        targetId,
        placeAfter,
        score,
      };
    }
  }

  if (bestMatch) {
    return {
      targetId: bestMatch.targetId,
      placeAfter: bestMatch.placeAfter,
    };
  }

  return resolveLastInRowRightOrTrailingBlank(grid, clientX, clientY);
}
