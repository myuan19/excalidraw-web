import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MIME_TYPES, arrayToMap, nextAnimationFrame } from "@excalidraw/common";

import { duplicateElements } from "@excalidraw/element";

import clsx from "clsx";

import { deburr } from "../deburr";

import {
  useLibraryCache,
  useLibraryItemSvg,
} from "../hooks/useLibraryItemSvg";
import type { SvgCache } from "../hooks/useLibraryItemSvg";
import { useScrollPosition } from "../hooks/useScrollPosition";
import { t } from "../i18n";

import {
  LibraryMenuSection,
  LibraryMenuSectionGrid,
} from "./LibraryMenuSection";
import type { LibraryReorderDropIndicator } from "./libraryReorderDrop";
import {
  isLibraryItemDragOver,
  resolveGridGapDropTarget,
} from "./libraryReorderDrop";

import Spinner from "./Spinner";

import "./LibraryMenuItems.scss";

import { TextField } from "./TextField";

import { useApp, useEditorInterface } from "./App";

import { Button } from "./Button";
import { getLibraryAIActions } from "../data/libraryAIActions";

import type { ExcalidrawLibraryIds } from "../data/types";

import type {
  ExcalidrawProps,
  LibraryItem,
  LibraryItems,
  UIAppState,
} from "../types";

const ITEMS_RENDERED_PER_BATCH = 17;
const CACHED_ITEMS_RENDERED_PER_BATCH = 64;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDraggedLibraryItemId(dataTransfer: DataTransfer): string | null {
  let draggedId = dataTransfer.getData("text/x-library-item-id");
  if (draggedId) {
    return draggedId;
  }
  const raw = dataTransfer.getData("text/plain");
  if (raw.startsWith("excalidraw-lib-reorder:")) {
    draggedId = raw.slice("excalidraw-lib-reorder:".length);
    if (draggedId) {
      return draggedId;
    }
  }
  try {
    const idsJson = dataTransfer.getData(MIME_TYPES.excalidrawlibIds);
    if (idsJson) {
      const parsed = JSON.parse(idsJson) as { itemIds?: string[] };
      if (parsed.itemIds?.length) {
        return parsed.itemIds[0];
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isCanvasLibraryItem(item: LibraryItem): boolean {
  return item.scope === "canvas";
}

function isGlobalLibraryItem(item: LibraryItem): boolean {
  return !isCanvasLibraryItem(item);
}

function reorderGlobalBlock(
  full: LibraryItems,
  fromId: string,
  toId: string,
  placeAfter: boolean,
): LibraryItems {
  const isBlock = (item: LibraryItem) => isGlobalLibraryItem(item);
  const block = full.filter(isBlock);
  const tail = full.filter((item) => !isBlock(item));
  const fromIdx = block.findIndex((i) => i.id === fromId);
  const toIdx = block.findIndex((i) => i.id === toId);
  if (fromIdx < 0 || toIdx < 0) {
    return [...full];
  }
  const next = [...block];
  const [removed] = next.splice(fromIdx, 1);
  let insertAt = next.findIndex((i) => i.id === toId);
  if (insertAt === -1) {
    return [...full];
  }
  if (placeAfter) {
    insertAt += 1;
  }
  next.splice(insertAt, 0, removed);
  return [...next, ...tail];
}

// ---------------------------------------------------------------------------
// LibraryItemDetailPanel — shown when user clicks an item
// ---------------------------------------------------------------------------

const LIB_REORDER_PREFIX = "excalidraw-lib-reorder:";

function LibraryItemDetailPanel({
  item,
  svgCache,
  onClose,
  onSaveName,
  onAiTag,
  aiTagging,
  aiError,
  onDismissAiError,
  onPreviewDragStart,
  isPhoneLayout,
}: {
  item: LibraryItem;
  svgCache: SvgCache;
  onClose: () => void;
  onSaveName: (name: string) => void;
  onAiTag: () => void;
  aiTagging: boolean;
  aiError: string | null;
  onDismissAiError: () => void;
  onPreviewDragStart?: (event: React.DragEvent) => void;
  isPhoneLayout?: boolean;
}) {
  const [editingName, setEditingName] = useState(item.name || "");
  const previewRef = useRef<HTMLDivElement | null>(null);
  const svg = useLibraryItemSvg(item.id, item.elements, svgCache, previewRef);

  useEffect(() => {
    setEditingName(item.name || "");
  }, [item.name]);

  const createdDate = item.created
    ? new Date(item.created).toLocaleString()
    : "—";
  const scope = isCanvasLibraryItem(item) ? "canvas" : "global";

  const handleSave = () => {
    const trimmed = editingName.trim();
    if (trimmed !== (item.name || "")) {
      onSaveName(trimmed);
    }
  };

  return (
    <div
      className={clsx("lib-detail", isPhoneLayout && "lib-detail--sheet")}
    >
      <div className="lib-detail__header">
        <button
          type="button"
          className="lib-detail__back"
          onClick={onClose}
          aria-label={t("library.detailBack")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("library.detailBack")}
        </button>
      </div>
      <div
        className="lib-detail__preview"
        ref={previewRef}
        draggable={!!svg && !!onPreviewDragStart && !!item.elements?.length}
        title={
          svg && onPreviewDragStart && item.elements?.length
            ? "拖到画布插入"
            : undefined
        }
        onDragStart={(e) => {
          if (!onPreviewDragStart || !item.elements?.length) {
            e.preventDefault();
            return;
          }
          onPreviewDragStart(e);
        }}
      >
        {svg && (
          <div
            className="lib-detail__svg"
            dangerouslySetInnerHTML={{ __html: svg.outerHTML }}
          />
        )}
      </div>
      <div className="lib-detail__fields">
        <label className="lib-detail__label">
          {"Name"}
          <div className="lib-detail__name-row">
            <input
              type="text"
              className="lib-detail__input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSave();
                }
              }}
              placeholder="Untitled"
            />
            <button
              type="button"
              className="lib-detail__ai-btn"
              onClick={onAiTag}
              disabled={aiTagging}
              title="AI 自动生成标签"
            >
              {aiTagging ? "…" : "AI"}
            </button>
          </div>
        </label>
        {aiError && (
          <div
            className="lib-detail__error"
            onClick={onDismissAiError}
            title="点击关闭"
          >
            {aiError}
          </div>
        )}
        <div className="lib-detail__meta">
          <div className="lib-detail__meta-row">
            <span className="lib-detail__meta-key">ID</span>
            <span className="lib-detail__meta-val">{item.id}</span>
          </div>
          <div className="lib-detail__meta-row">
            <span className="lib-detail__meta-key">Created</span>
            <span className="lib-detail__meta-val">{createdDate}</span>
          </div>
          <div className="lib-detail__meta-row">
            <span className="lib-detail__meta-key">Status</span>
            <span className="lib-detail__meta-val">{scope}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// (GroupDividerRow / GroupGapRow removed — public tab is now flat list)

// ---------------------------------------------------------------------------
// SelectionBar (always visible in library header)
// ---------------------------------------------------------------------------

function SelectionBar({
  count,
  onDeselectAll,
  onDeleteSelected,
  onAiTag,
  aiTagging,
  aiProgress,
  aiError,
  onDismissAiError,
  onSelectAll,
  onSelectUnnamed,
  hasUnnamed,
  showInsert,
  onInsertSelectedItems,
}: {
  count: number;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
  onAiTag: () => void;
  aiTagging: boolean;
  aiProgress: { done: number; total: number } | null;
  aiError: string | null;
  onDismissAiError: () => void;
  onSelectAll: () => void;
  onSelectUnnamed: () => void;
  hasUnnamed: boolean;
  showInsert?: boolean;
  onInsertSelectedItems?: () => void;
}) {
  const hasItems = count > 0;
  const progressLabel = aiProgress
    ? `${aiProgress.done}/${aiProgress.total}`
    : null;
  return (
    <div className={clsx("lib-selection-bar", { "lib-selection-bar--empty": !hasItems })}>
      <span className="lib-selection-bar__count">
        {`${count} ${t("stats.selected").toLowerCase()}`}
      </span>
      <div className="lib-selection-bar__actions">
        {showInsert && onInsertSelectedItems && (
          <button
            type="button"
            className="lib-selection-bar__btn lib-selection-bar__btn--insert"
            onClick={onInsertSelectedItems}
            disabled={!hasItems}
            title="插入选中素材"
          >
            插入
          </button>
        )}
        <button
          type="button"
          className="lib-selection-bar__btn lib-selection-bar__btn--ai"
          onClick={onAiTag}
          disabled={!hasItems || aiTagging}
          title="AI 标签"
        >
          {aiTagging ? `生成中${progressLabel ? ` (${progressLabel})` : "…"}` : "AI 标签"}
        </button>
        <button
          type="button"
          className="lib-selection-bar__btn"
          onClick={onSelectAll}
          title="全选"
        >
          全选
        </button>
        <button
          type="button"
          className="lib-selection-bar__btn"
          onClick={onSelectUnnamed}
          disabled={!hasUnnamed}
          title={hasUnnamed ? "选中未命名素材" : "所有素材均已命名"}
        >
          选中未命名
        </button>
        <button
          type="button"
          className="lib-selection-bar__btn lib-selection-bar__btn--danger"
          onClick={onDeleteSelected}
          disabled={!hasItems}
          title={t("buttons.remove")}
        >
          {t("buttons.remove")}
        </button>
        <button
          type="button"
          className="lib-selection-bar__btn"
          onClick={onDeselectAll}
        >
          {t("buttons.cancel")}
        </button>
      </div>
      {aiError && (
        <div
          className="lib-selection-bar__error"
          onClick={onDismissAiError}
          title="点击关闭"
        >
          <span className="lib-selection-bar__error-text">{aiError}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LibraryMenuItems({
  isLoading,
  libraryItems,
  onAddToLibrary,
  onInsertLibraryItems,
  pendingElements,
  theme,
  id,
  libraryReturnUrl,
  onSelectItems,
  selectedItems,
}: {
  isLoading: boolean;
  libraryItems: LibraryItems;
  pendingElements: LibraryItem["elements"];
  onInsertLibraryItems: (libraryItems: LibraryItems) => void;
  onAddToLibrary: (elements: LibraryItem["elements"]) => void;
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
  selectedItems: LibraryItem["id"][];
  onSelectItems: (id: LibraryItem["id"][]) => void;
}) {
  const { library } = useApp();
  const { deleteItemsFromLibraryCache } = useLibraryCache();
  const editorInterface = useEditorInterface();
  const libraryContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useScrollPosition<HTMLDivElement>(libraryContainerRef);

  const [searchInputValue, setSearchInputValue] = useState("");
  const [lastSelectedItem, setLastSelectedItem] = useState<
    LibraryItem["id"] | null
  >(null);

  useEffect(() => {
    if (scrollPosition > 0) {
      libraryContainerRef.current?.scrollTo(0, scrollPosition);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { svgCache } = useLibraryCache();
  const [reorderDropIndicator, setReorderDropIndicator] =
    useState<LibraryReorderDropIndicator | null>(null);
  const [reorderDragSourceId, setReorderDragSourceId] = useState<string | null>(
    null,
  );

  const IS_LIBRARY_EMPTY = !libraryItems.length && !pendingElements.length;
  const IS_SEARCHING = !IS_LIBRARY_EMPTY && !!searchInputValue.trim();

  const filteredItems = useMemo(() => {
    const raw = searchInputValue.trim().toLowerCase();
    if (!raw) {
      return [];
    }
    const deburredQuery = deburr(raw);
    const rawTokens = deburredQuery.split(/\s+/).filter(Boolean);
    const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
    const tokens: string[] = [];
    for (const tok of rawTokens) {
      tokens.push(tok);
      const cjkChars = tok.match(CJK_RE);
      if (cjkChars) {
        for (const ch of cjkChars) {
          tokens.push(ch);
        }
      }
    }
    return libraryItems.filter((item) => {
      const itemName = item.name || "";
      if (!itemName.trim()) {
        return false;
      }
      const haystack = deburr(itemName.toLowerCase());
      return tokens.some((tok) => haystack.includes(tok));
    });
  }, [libraryItems, searchInputValue]);

  const globalItems = useMemo(
    () => libraryItems.filter((item) => isGlobalLibraryItem(item)),
    [libraryItems],
  );

  const onLibraryReorderRef = useRef<
    ((draggedId: string, targetId: string, placeAfter: boolean) => void) | null
  >(null);

  const handleLibraryPanelDrop = useCallback(
    (e: React.DragEvent) => {
      const itemId = getDraggedLibraryItemId(e.dataTransfer);
      const hasLibIds = [...e.dataTransfer.types].some(
        (tp) => tp.toLowerCase() === MIME_TYPES.excalidrawlibIds.toLowerCase(),
      );
      const hasLibBlob = [...e.dataTransfer.types].some(
        (tp) => tp.toLowerCase() === MIME_TYPES.excalidrawlib.toLowerCase(),
      );
      const isLibraryDrag =
        !!itemId || hasLibIds || hasLibBlob || isLibraryItemDragOver(e);

      if (!isLibraryDrag) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if ((e.target as Element | null)?.closest?.(".library-unit")) {
        return;
      }
      const gapTarget = resolveGridGapDropTarget(
        e.target,
        e.clientX,
        e.clientY,
      );
      if (itemId && gapTarget && onLibraryReorderRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onLibraryReorderRef.current(
          itemId,
          gapTarget.targetId,
          gapTarget.placeAfter,
        );
      }
    },
    [],
  );

  const handleLibraryPanelDragOver = useCallback((e: React.DragEvent) => {
    if (isLibraryItemDragOver(e)) {
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    const onDragEnd = () => {
      setReorderDropIndicator(null);
      setReorderDragSourceId(null);
    };
    document.addEventListener("dragend", onDragEnd);
    return () => {
      document.removeEventListener("dragend", onDragEnd);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Selection, insert, drag
  // ---------------------------------------------------------------------------

  const orderedItemsForSelection = useMemo(() => {
    if (IS_SEARCHING) {
      return filteredItems;
    }
    return globalItems;
  }, [IS_SEARCHING, filteredItems, globalItems]);

  const onLibraryReorder = useCallback(
    (draggedId: string, targetId: string, placeAfter: boolean) => {
      if (draggedId === targetId) {
        return;
      }
      const next = reorderGlobalBlock(
        libraryItems,
        draggedId,
        targetId,
        placeAfter,
      );
      library.setLibrary(next);
    },
    [libraryItems, library],
  );
  onLibraryReorderRef.current = onLibraryReorder;

  const onItemSelectToggle = useCallback(
    (id: LibraryItem["id"], event: React.MouseEvent) => {
      const shouldSelect = !selectedItems.includes(id);
      const orderedItems = orderedItemsForSelection;
      if (shouldSelect) {
        if (event.shiftKey && lastSelectedItem) {
          const rangeStart = orderedItems.findIndex(
            (item) => item.id === lastSelectedItem,
          );
          const rangeEnd = orderedItems.findIndex((item) => item.id === id);
          if (rangeStart === -1 || rangeEnd === -1) {
            onSelectItems([...selectedItems, id]);
            return;
          }
          const selectedItemsMap = arrayToMap(selectedItems);
          const minRange = Math.min(rangeStart, rangeEnd);
          const maxRange = Math.max(rangeStart, rangeEnd);
          const nextSelectedIds = orderedItems.reduce(
            (acc: LibraryItem["id"][], item, idx) => {
              if (
                (idx >= minRange && idx <= maxRange) ||
                selectedItemsMap.has(item.id)
              ) {
                acc.push(item.id);
              }
              return acc;
            },
            [],
          );
          onSelectItems(nextSelectedIds);
        } else {
          onSelectItems([...selectedItems, id]);
        }
        setLastSelectedItem(id);
      } else {
        setLastSelectedItem(null);
        onSelectItems(selectedItems.filter((_id) => _id !== id));
      }
    },
    [lastSelectedItem, onSelectItems, orderedItemsForSelection, selectedItems],
  );

  useEffect(() => {
    if (!selectedItems.length) {
      setLastSelectedItem(null);
    }
  }, [selectedItems]);

  const getInsertedElements = useCallback(
    (clickedId: string) => {
      let targetElements;
      if (selectedItems.includes(clickedId)) {
        targetElements = libraryItems.filter((item) =>
          selectedItems.includes(item.id),
        );
      } else {
        targetElements = libraryItems.filter((item) => item.id === clickedId);
      }
      return targetElements.map((item) => ({
        ...item,
        elements: duplicateElements({
          type: "everything",
          elements: item.elements,
          randomizeSeed: true,
        }).duplicatedElements,
      }));
    },
    [libraryItems, selectedItems],
  );

  const onItemDrag = useCallback(
    (itemId: LibraryItem["id"], event: React.DragEvent) => {
      const data: ExcalidrawLibraryIds = {
        itemIds: selectedItems.includes(itemId) ? selectedItems : [itemId],
      };
      event.dataTransfer.setData(
        MIME_TYPES.excalidrawlibIds,
        JSON.stringify(data),
      );
      event.dataTransfer.setData("text/x-library-item-id", itemId);
      setReorderDragSourceId(itemId);
    },
    [selectedItems],
  );

  const isItemSelected = useCallback(
    (itemId: LibraryItem["id"] | null) => {
      if (!itemId) {
        return false;
      }
      return selectedItems.includes(itemId);
    },
    [selectedItems],
  );

  const onAddToLibraryClick = useCallback(
    (_id: LibraryItem["id"] | null, _event: React.MouseEvent) => {
      onAddToLibrary(pendingElements);
    },
    [pendingElements, onAddToLibrary],
  );

  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const handleOpenLibraryDetail = useCallback((id: string) => {
    setDetailItemId(id);
  }, []);

  const onItemClick = useCallback(
    (clickedId: LibraryItem["id"] | null, event: React.MouseEvent) => {
      if (!clickedId) {
        return;
      }
      if (editorInterface.formFactor === "phone") {
        onItemSelectToggle(clickedId, event);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        setDetailItemId(clickedId);
        return;
      }
      onInsertLibraryItems(getInsertedElements(clickedId));
    },
    [
      editorInterface.formFactor,
      getInsertedElements,
      onInsertLibraryItems,
      onItemSelectToggle,
    ],
  );

  const onInsertSelectedItems = useCallback(() => {
    if (!selectedItems.length) {
      return;
    }
    onInsertLibraryItems(getInsertedElements(selectedItems[0]));
    onSelectItems([]);
  }, [getInsertedElements, onInsertLibraryItems, onSelectItems, selectedItems]);

  const detailItem = useMemo(
    () =>
      detailItemId
        ? libraryItems.find((item) => item.id === detailItemId) ?? null
        : null,
    [detailItemId, libraryItems],
  );

  const onDetailPreviewDragStart = useCallback(
    (event: React.DragEvent) => {
      if (!detailItem?.id || !detailItem.elements?.length) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData(
        "text/plain",
        `${LIB_REORDER_PREFIX}${detailItem.id}`,
      );
      event.dataTransfer.effectAllowed = "move";
      setReorderDragSourceId(detailItem.id);
      onItemDrag(detailItem.id, event);
    },
    [detailItem, onItemDrag],
  );

  const handleDetailSaveName = useCallback(
    async (newName: string) => {
      if (!detailItemId) {
        return;
      }
      const latest = await library.getLatestLibrary();
      const nextItems = latest.map((item) =>
        item.id === detailItemId ? { ...item, name: newName } : item,
      );
      library.setLibrary(nextItems);
    },
    [detailItemId, library],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedItems.length) return;
    const latest = await library.getLatestLibrary();
    const nextItems = latest.filter(
      (item) => !selectedItems.includes(item.id),
    );
    library.setLibrary(nextItems);
    deleteItemsFromLibraryCache(selectedItems);
    onSelectItems([]);
  }, [selectedItems, library, deleteItemsFromLibraryCache, onSelectItems]);

  const [aiTagging, setAiTagging] = useState(false);
  const [aiTagError, setAiTagError] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  const handleAiTag = useCallback(async () => {
    if (!selectedItems.length || aiTagging) {
      return;
    }
    const itemsToTag = libraryItems
      .filter((item) => selectedItems.includes(item.id))
      .map((item) => ({ id: item.id, elements: item.elements }));
    if (!itemsToTag.length) {
      return;
    }
    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setAiTagging(true);
    setAiTagError(null);
    setAiProgress({ done: 0, total: itemsToTag.length });
    try {
      const tagMap = await getLibraryAIActions().generateIconTags(
        itemsToTag,
        (done, total) => {
          if (!ac.signal.aborted) {
            setAiProgress({ done, total });
          }
        },
        ac.signal,
      );
      if (!ac.signal.aborted && tagMap.size > 0) {
        const latest = await library.getLatestLibrary();
        const nextItems = latest.map((item) => {
          const tag = tagMap.get(item.id);
          return tag ? { ...item, name: tag } : item;
        });
        library.setLibrary(nextItems);
      }
    } catch (err: unknown) {
      if (!ac.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        setAiTagError(msg);
      }
    } finally {
      if (!ac.signal.aborted) {
        setAiTagging(false);
        setAiProgress(null);
      }
    }
  }, [selectedItems, libraryItems, library, aiTagging]);

  const handleDetailAiTag = useCallback(async () => {
    if (!detailItemId || aiTagging) {
      return;
    }
    const item = libraryItems.find((i) => i.id === detailItemId);
    if (!item) {
      return;
    }
    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setAiTagging(true);
    setAiTagError(null);
    setAiProgress({ done: 0, total: 1 });
    try {
      const tagMap = await getLibraryAIActions().generateIconTags(
        [{ id: item.id, elements: item.elements }],
        (done, total) => {
          if (!ac.signal.aborted) {
            setAiProgress({ done, total });
          }
        },
        ac.signal,
      );
      if (!ac.signal.aborted) {
        const tag = tagMap.get(item.id);
        if (tag) {
          const latest = await library.getLatestLibrary();
          const nextItems = latest.map((i) =>
            i.id === item.id ? { ...i, name: tag } : i,
          );
          library.setLibrary(nextItems);
        }
      }
    } catch (err: unknown) {
      if (!ac.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        setAiTagError(msg);
      }
    } finally {
      if (!ac.signal.aborted) {
        setAiTagging(false);
        setAiProgress(null);
      }
    }
  }, [detailItemId, libraryItems, library, aiTagging]);

  const itemsRenderedPerBatch =
    svgCache.size >=
    (filteredItems.length ? filteredItems : libraryItems).length
      ? CACHED_ITEMS_RENDERED_PER_BATCH
      : ITEMS_RENDERED_PER_BATCH;

  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nextAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const enableReorder = !IS_SEARCHING && globalItems.length > 1;

  const handleReorderHoverChange = useCallback(
    (ind: LibraryReorderDropIndicator | null) => {
      setReorderDropIndicator(ind);
    },
    [],
  );

  const libraryGridReorderProps = useMemo(
    () => ({
      enableLibraryReorder: enableReorder,
      onReorderHoverChange: handleReorderHoverChange,
      reorderDragSourceId,
    }),
    [enableReorder, handleReorderHoverChange, reorderDragSourceId],
  );

  const listItems = globalItems;

  const handleSelectAll = useCallback(() => {
    const ids = listItems.map((item) => item.id);
    onSelectItems(ids);
  }, [listItems, onSelectItems]);

  const handleSelectUnnamed = useCallback(() => {
    const ids = listItems
      .filter((item) => !item.name?.trim())
      .map((item) => item.id);
    onSelectItems(ids);
  }, [listItems, onSelectItems]);

  const renderLibraryContent = () => {
    if (!pendingElements.length && !globalItems.length) {
      return (
        <div className="lib-empty">
          <div className="lib-empty__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="lib-empty__title">{t("library.noItems")}</div>
          <div className="lib-empty__hint">{t("library.hint_emptyLibrary")}</div>
        </div>
      );
    }
    return (
      <LibraryMenuSectionGrid {...libraryGridReorderProps}>
        {pendingElements.length > 0 && (
          <LibraryMenuSection
            itemsRenderedPerBatch={itemsRenderedPerBatch}
            items={[{ id: null, elements: pendingElements }]}
            onItemSelectToggle={onItemSelectToggle}
            onItemDrag={onItemDrag}
            onClick={onAddToLibraryClick}
            isItemSelected={isItemSelected}
            svgCache={svgCache}
            reorderDropIndicator={reorderDropIndicator}
            onReorderDragSourceId={setReorderDragSourceId}
          />
        )}
        <LibraryMenuSection
          itemsRenderedPerBatch={itemsRenderedPerBatch}
          items={globalItems}
          onItemSelectToggle={onItemSelectToggle}
          onItemDrag={onItemDrag}
          onClick={onItemClick}
          onOpenDetail={handleOpenLibraryDetail}
          isItemSelected={isItemSelected}
          svgCache={svgCache}
          enableLibraryReorder={enableReorder}
          onLibraryReorder={onLibraryReorder}
          reorderDropIndicator={reorderDropIndicator}
          onReorderDragSourceId={setReorderDragSourceId}
        />
      </LibraryMenuSectionGrid>
    );
  };

  // ---------------------------------------------------------------------------
  // JSX: Search results
  // ---------------------------------------------------------------------------

  const renderSearchResults = () => {
    if (!IS_SEARCHING) {
      return null;
    }
    return (
      <>
        <div className="lib-search-header">
          <span className="lib-search-header__label">
            {t("library.search.heading")}
          </span>
          {!isLoading && (
            <button
              type="button"
              className="lib-search-header__clear"
              onClick={() => setSearchInputValue("")}
            >
              <kbd>esc</kbd>
            </button>
          )}
        </div>
        {filteredItems.length > 0 ? (
          <LibraryMenuSectionGrid {...libraryGridReorderProps}>
            <LibraryMenuSection
              itemsRenderedPerBatch={itemsRenderedPerBatch}
              items={filteredItems}
              onItemSelectToggle={onItemSelectToggle}
              onItemDrag={onItemDrag}
              onClick={onItemClick}
              onOpenDetail={handleOpenLibraryDetail}
              isItemSelected={isItemSelected}
              svgCache={svgCache}
              reorderDropIndicator={reorderDropIndicator}
              onReorderDragSourceId={setReorderDragSourceId}
            />
          </LibraryMenuSectionGrid>
        ) : (
          <div className="lib-empty">
            <div className="lib-empty__hint">
              {t("library.search.noResults")}
            </div>
            <Button
              onPointerDown={(e) => e.preventDefault()}
              onSelect={() => setSearchInputValue("")}
              style={{ width: "auto", marginTop: "0.75rem" }}
            >
              {t("library.search.clearSearch")}
            </Button>
          </div>
        )}
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="lib-container"
      onDragOver={handleLibraryPanelDragOver}
      onDragOverCapture={handleLibraryPanelDragOver}
      onDrop={handleLibraryPanelDrop}
    >
      {/* ZONE A: Header (search → selection bar → tabs) */}
      {!IS_LIBRARY_EMPTY && (
        <div className="lib-header">
          <TextField
            ref={searchInputRef}
            type="search"
            className={clsx("lib-search", {
              "lib-search--hide-cancel":
                editorInterface.formFactor !== "phone",
            })}
            placeholder={t("library.search.inputPlaceholder")}
            value={searchInputValue}
            onChange={(value) => setSearchInputValue(value)}
          />

          <SelectionBar
            count={selectedItems.length}
            onDeselectAll={() => onSelectItems([])}
            onDeleteSelected={handleDeleteSelected}
            onAiTag={handleAiTag}
            aiTagging={aiTagging}
            aiProgress={aiProgress}
            aiError={aiTagError}
            onDismissAiError={() => setAiTagError(null)}
            onSelectAll={handleSelectAll}
            onSelectUnnamed={handleSelectUnnamed}
            hasUnnamed={listItems.some((item) => !item.name?.trim())}
            showInsert={editorInterface.formFactor === "phone"}
            onInsertSelectedItems={onInsertSelectedItems}
          />

          {!detailItemId && (
            <p className="lib-interaction-hint" id="lib-interaction-hint">
              {t("library.interactionHint")}
            </p>
          )}
        </div>
      )}

      {/* ZONE C: Content (scrollable) */}
      <div
        className="lib-content"
        ref={libraryContainerRef}
      >
        {detailItem ? (
          <LibraryItemDetailPanel
            item={detailItem}
            svgCache={svgCache}
            onClose={() => setDetailItemId(null)}
            onSaveName={handleDetailSaveName}
            onAiTag={handleDetailAiTag}
            aiTagging={aiTagging}
            aiError={aiTagError}
            onDismissAiError={() => setAiTagError(null)}
            onPreviewDragStart={onDetailPreviewDragStart}
            isPhoneLayout={editorInterface.formFactor === "phone"}
          />
        ) : (
          <>
            {isLoading && (
              <div className="lib-content__spinner">
                <Spinner />
              </div>
            )}

            {IS_LIBRARY_EMPTY ? (
              <div className="lib-empty lib-empty--full">
                <div className="lib-empty__icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="lib-empty__title">{t("library.noItems")}</div>
                <div className="lib-empty__hint">{t("library.hint_emptyLibrary")}</div>
              </div>
            ) : IS_SEARCHING ? (
              renderSearchResults()
            ) : (
              <>
                {renderLibraryContent()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
