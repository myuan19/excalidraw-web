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
import { useAtomValue } from "../editor-jotai";
import {
  libraryGroupsAtom,
  libraryCollapsedAtom,
} from "../data/libraryGroupsAtom";
import { getLibraryGroupActions } from "../data/libraryGroupActions";
import { getLibraryAIActions } from "../data/libraryAIActions";

import type { LibraryGroup } from "../data/libraryGroupsAtom";
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

function getLibraryScope(item: LibraryItem): "personal" | "public" | "canvas" {
  if (
    item.scope === "public" ||
    item.scope === "canvas" ||
    item.scope === "personal"
  ) {
    return item.scope;
  }
  return item.status === "published" ? "public" : "personal";
}

function reorderPersonalBlock(
  full: LibraryItems,
  fromId: string,
  toId: string,
  placeAfter: boolean,
): LibraryItems {
  const isBlock = (item: LibraryItem) => {
    const s = getLibraryScope(item);
    return s === "canvas" || s === "personal";
  };
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

function reorderPublicBlock(
  full: LibraryItems,
  fromId: string,
  toId: string,
  placeAfter: boolean,
): LibraryItems {
  const isBlock = (item: LibraryItem) => getLibraryScope(item) === "public";
  const head = full.filter((item) => !isBlock(item));
  const block = full.filter(isBlock);
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
  return [...head, ...next];
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
  const scope = getLibraryScope(item);

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

// ---------------------------------------------------------------------------
// GroupDividerRow
// ---------------------------------------------------------------------------

const CHEVRON_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const DRAG_HANDLE_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.45">
    <circle cx="9" cy="6" r="1.8" />
    <circle cx="15" cy="6" r="1.8" />
    <circle cx="9" cy="12" r="1.8" />
    <circle cx="15" cy="12" r="1.8" />
    <circle cx="9" cy="18" r="1.8" />
    <circle cx="15" cy="18" r="1.8" />
  </svg>
);

const TRASH_SMALL_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

interface GroupDividerProps {
  groupId: string;
  name: string;
  collapsed: boolean;
  itemCount: number;
  allSelected: boolean;
  isDragging: boolean;
  onToggleCollapse: (groupId: string) => void;
  onRename: (groupId: string, newName: string) => void;
  onDelete: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onGroupDragStart: (groupId: string, e: React.DragEvent) => void;
  onGroupDragOver: (groupId: string, e: React.DragEvent) => void;
  onGroupDrop: (groupId: string, e: React.DragEvent) => void;
  onItemDropOnGroup: (groupId: string, e: React.DragEvent) => void;
  dragOverGroupId: string | null;
}

function GroupDividerRow({
  groupId,
  name,
  collapsed,
  itemCount,
  allSelected,
  isDragging,
  onToggleCollapse,
  onRename,
  onDelete,
  onSelectGroup,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDrop,
  onItemDropOnGroup,
  dragOverGroupId,
}: GroupDividerProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const finishRename = (save: boolean) => {
    setRenaming(false);
    if (save) {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== name) {
        onRename(groupId, trimmed);
      }
    }
    setRenameValue(name);
  };

  const isDragOver = dragOverGroupId === groupId;

  return (
    <div
      className={clsx("lib-group", {
        "lib-group--drag-over": isDragOver,
        "lib-group--collapsed": collapsed,
        "lib-group--renaming": renaming,
        "lib-group--dragging": isDragging,
        "lib-group--all-selected": allSelected && itemCount > 0,
      })}
      draggable
      onDragStart={(e) => {
        onGroupDragStart(groupId, e);
      }}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        const target = e.target as Element;
        if (
          target.closest(
            ".lib-group__delete, .lib-group__rename-input, .lib-group__name",
          )
        ) {
          return;
        }
        onToggleCollapse(groupId);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onGroupDragOver(groupId, e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onGroupDrop(groupId, e);
        onItemDropOnGroup(groupId, e);
      }}
    >
      <span className="lib-group__handle" aria-hidden>
        {DRAG_HANDLE_ICON}
      </span>
      <span
        className={clsx("lib-group__chevron", {
          "lib-group__chevron--collapsed": collapsed,
        })}
      >
        {CHEVRON_ICON}
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          type="text"
          className="lib-group__rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishRename(true);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              finishRename(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => finishRename(true)}
        />
      ) : (
        <span
          className="lib-group__name"
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRenameValue(name);
            setRenaming(true);
          }}
          title={name}
        >
          {name}
        </span>
      )}
      {itemCount > 0 && (
        <button
          type="button"
          className={clsx("lib-group__badge", {
            "lib-group__badge--all-selected": allSelected,
          })}
          title={allSelected ? "取消选中该分组" : "选中该分组所有素材"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectGroup(groupId);
          }}
        >
          {itemCount}
        </button>
      )}
      {confirmDelete ? (
        <span className="lib-group__confirm-delete" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="lib-group__confirm-btn lib-group__confirm-btn--yes"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(groupId);
              setConfirmDelete(false);
            }}
          >
            确认
          </button>
          <button
            type="button"
            className="lib-group__confirm-btn"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(false);
            }}
          >
            取消
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="lib-group__delete"
          title={t("buttons.remove")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmDelete(true);
          }}
        >
          {TRASH_SMALL_ICON}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupGapRow
// ---------------------------------------------------------------------------

function GroupGapRow({
  gapIndex,
  dragOverGapIndex,
  draggingGroupId,
  onGapDragOver,
  onGapDrop,
  onGapDragLeave,
}: {
  gapIndex: number;
  dragOverGapIndex: number | null;
  draggingGroupId: string | null;
  onGapDragOver: (gapIndex: number, e: React.DragEvent) => void;
  onGapDrop: (gapIndex: number, e: React.DragEvent) => void;
  onGapDragLeave: (e: React.DragEvent) => void;
}) {
  const active = draggingGroupId != null && dragOverGapIndex === gapIndex;
  return (
    <div
      className={clsx("lib-group-gap", { "lib-group-gap--active": active })}
      onDragOver={(e) => onGapDragOver(gapIndex, e)}
      onDrop={(e) => onGapDrop(gapIndex, e)}
      onDragLeave={onGapDragLeave}
    />
  );
}

// ---------------------------------------------------------------------------
// SelectionBar (shown when items are selected, replaces tabs)
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
  showNewGroup,
  onNewGroup,
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
  showNewGroup?: boolean;
  onNewGroup?: () => void;
}) {
  const hasItems = count > 0;
  const progressLabel = aiProgress
    ? `${aiProgress.done}/${aiProgress.total}`
    : null;
  return (
    <div className={clsx("lib-selection-bar", { "lib-selection-bar--empty": !hasItems })}>
      <span className="lib-selection-bar__count">
        {count} {t("stats.selected").toLowerCase()}
      </span>
      <div className="lib-selection-bar__actions">
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
          title="全选当前 Tab"
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
        {hasItems && (
          <button
            type="button"
            className="lib-selection-bar__btn"
            onClick={onDeselectAll}
          >
            {t("buttons.cancel")}
          </button>
        )}
        {showNewGroup && onNewGroup && (
          <button
            type="button"
            className="lib-selection-bar__new-group"
            onClick={onNewGroup}
            title="New group"
          >
            +
          </button>
        )}
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

  const [libraryTab, setLibraryTab] = useState<"personal" | "public">(
    "personal",
  );

  useEffect(() => {
    if (scrollPosition > 0) {
      libraryContainerRef.current?.scrollTo(0, scrollPosition);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setLibraryTab("public");
    window.addEventListener("excalidraw-library-imported", handler);
    return () =>
      window.removeEventListener("excalidraw-library-imported", handler);
  }, []);

  const { svgCache } = useLibraryCache();
  const [lastSelectedItem, setLastSelectedItem] = useState<
    LibraryItem["id"] | null
  >(null);

  const [searchInputValue, setSearchInputValue] = useState("");
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

  const unpublishedItems = useMemo(
    () => libraryItems.filter((item) => item.status !== "published"),
    [libraryItems],
  );

  const publishedItems = useMemo(
    () => libraryItems.filter((item) => item.status === "published"),
    [libraryItems],
  );

  // ---------------------------------------------------------------------------
  // Group state from Jotai atoms
  // ---------------------------------------------------------------------------

  const groups: LibraryGroup[] = useAtomValue(libraryGroupsAtom);
  const collapsedMap: Record<string, boolean> =
    useAtomValue(libraryCollapsedAtom);

  // ---------------------------------------------------------------------------
  // Group action callbacks
  // ---------------------------------------------------------------------------

  const handleToggleCollapse = useCallback((groupId: string) => {
    getLibraryGroupActions().toggleGroupCollapsed(groupId);
  }, []);

  const handleSelectGroup = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) {
        return;
      }
      const publishedSet = new Set(publishedItems.map((i) => i.id));
      const groupItemIds = group.itemIds.filter((id) => publishedSet.has(id));
      if (!groupItemIds.length) {
        return;
      }
      const selectedSet = new Set(selectedItems);
      const allSelected = groupItemIds.every((id) => selectedSet.has(id));
      if (allSelected) {
        onSelectItems(
          selectedItems.filter((id) => !groupItemIds.includes(id)),
        );
      } else {
        const merged = new Set(selectedItems);
        for (const id of groupItemIds) {
          merged.add(id);
        }
        onSelectItems([...merged]);
      }
    },
    [groups, publishedItems, selectedItems, onSelectItems],
  );

  const handleRenameGroup = useCallback(
    (groupId: string, newName: string) => {
      getLibraryGroupActions().renameGroup(groupId, newName);
    },
    [],
  );

  const handleDeleteGroup = useCallback((groupId: string) => {
    getLibraryGroupActions().deleteGroup(groupId);
  }, []);

  const handleNewGroup = useCallback(() => {
    const name = prompt("Group name", "New group");
    if (name?.trim()) {
      const pubSelected =
        libraryTab === "public"
          ? selectedItems.filter((sid) =>
              publishedItems.some((item) => item.id === sid),
            )
          : [];
      getLibraryGroupActions().createGroup(name.trim(), pubSelected);
      if (pubSelected.length) {
        onSelectItems([]);
      }
    }
  }, [libraryTab, selectedItems, publishedItems, onSelectItems]);

  // ---------------------------------------------------------------------------
  // Cross-tab drag
  // ---------------------------------------------------------------------------

  const tabSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTabSwitchTimer = useCallback(() => {
    if (tabSwitchTimerRef.current != null) {
      clearTimeout(tabSwitchTimerRef.current);
      tabSwitchTimerRef.current = null;
    }
  }, []);

  const handleTabDragOver = useCallback(
    (tabName: "personal" | "public", e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.classList.add("lib-tab--drop-hover");
      if (libraryTab !== tabName && tabSwitchTimerRef.current == null) {
        tabSwitchTimerRef.current = setTimeout(() => {
          tabSwitchTimerRef.current = null;
          setLibraryTab(tabName);
          el.classList.remove("lib-tab--drop-hover");
        }, 400);
      }
    },
    [libraryTab],
  );

  const handleTabDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (
        !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)
      ) {
        (e.currentTarget as HTMLElement).classList.remove("lib-tab--drop-hover");
        clearTabSwitchTimer();
      }
    },
    [clearTabSwitchTimer],
  );

  const handleTabDrop = useCallback(
    (tabName: "personal" | "public", e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearTabSwitchTimer();
      (e.currentTarget as HTMLElement).classList.remove("lib-tab--drop-hover");
      const itemId = e.dataTransfer.getData("text/x-library-item-id");
      if (itemId) {
        const targetStatus =
          tabName === "personal" ? "unpublished" : "published";
        getLibraryGroupActions().moveItem(itemId, { status: targetStatus });
        setLibraryTab(tabName);
      }
    },
    [clearTabSwitchTimer],
  );

  const dragOriginTabRef = useRef<"personal" | "public" | null>(null);
  const onLibraryReorderRef = useRef<
    ((draggedId: string, targetId: string, placeAfter: boolean) => void) | null
  >(null);

  const handleLibraryPanelDrop = useCallback(
    (e: React.DragEvent) => {
      setDragOverGroupId(null);

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
        dragOriginTabRef.current = null;
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
        return;
      }
      if (
        itemId &&
        dragOriginTabRef.current != null &&
        dragOriginTabRef.current !== libraryTab
      ) {
        e.preventDefault();
        e.stopPropagation();
        const targetStatus =
          libraryTab === "personal" ? "unpublished" : "published";
        getLibraryGroupActions().moveItem(itemId, { status: targetStatus });
        dragOriginTabRef.current = null;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dragOriginTabRef.current = null;
    },
    [libraryTab],
  );

  const handleLibraryPanelDragOver = useCallback((e: React.DragEvent) => {
    if (isLibraryItemDragOver(e)) {
      e.preventDefault();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Group drag reorder
  // ---------------------------------------------------------------------------

  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverGapIndex, setDragOverGapIndex] = useState<number | null>(null);
  const [dragGroupOrder, setDragGroupOrder] = useState<string[] | null>(null);
  const lastSwapTimeRef = useRef(0);

  const handleGroupDragStart = useCallback(
    (groupId: string, e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/x-library-group-id", groupId);
      setDraggingGroupId(groupId);
      setDragGroupOrder(groups.map((g) => g.id));
    },
    [groups],
  );

  const handleGroupDragOver = useCallback(
    (groupId: string, e: React.DragEvent) => {
      const isGroupDrag = [...e.dataTransfer.types].includes(
        "text/x-library-group-id",
      );
      if (isLibraryItemDragOver(e) || isGroupDrag) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";

        if (isGroupDrag) {
          setDragOverGroupId(groupId);
        }

        if (isGroupDrag && draggingGroupId && draggingGroupId !== groupId) {
          const now = Date.now();
          if (now - lastSwapTimeRef.current < 150) {
            return;
          }
          lastSwapTimeRef.current = now;
          setDragGroupOrder((prev) => {
            if (!prev) {
              return prev;
            }
            const srcIdx = prev.indexOf(draggingGroupId);
            const tgtIdx = prev.indexOf(groupId);
            if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) {
              return prev;
            }
            const next = [...prev];
            next.splice(srcIdx, 1);
            next.splice(tgtIdx, 0, draggingGroupId);
            return next;
          });
        }
      }
    },
    [draggingGroupId],
  );

  const commitDragGroupOrder = useCallback(() => {
    if (!dragGroupOrder || !draggingGroupId) {
      return;
    }
    const targetIdx = dragGroupOrder.indexOf(draggingGroupId);
    if (targetIdx === -1) {
      return;
    }
    const srcIdx = groups.findIndex((g) => g.id === draggingGroupId);
    if (srcIdx === -1) {
      return;
    }
    const gapIndex = targetIdx >= srcIdx ? targetIdx + 1 : targetIdx;
    getLibraryGroupActions().reorderGroupToGap(draggingGroupId, gapIndex);
  }, [dragGroupOrder, draggingGroupId, groups]);

  const handleGroupDrop = useCallback(
    (_targetGroupId: string, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      commitDragGroupOrder();
      setDraggingGroupId(null);
      setDragOverGroupId(null);
      setDragOverGapIndex(null);
      setDragGroupOrder(null);
    },
    [commitDragGroupOrder],
  );

  const handleGroupGapDragOver = useCallback(
    (gapIndex: number, e: React.DragEvent) => {
      if (!draggingGroupId) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOverGapIndex(gapIndex);
      setDragOverGroupId(null);

      const now = Date.now();
      if (now - lastSwapTimeRef.current < 150) {
        return;
      }
      lastSwapTimeRef.current = now;
      setDragGroupOrder((prev) => {
        if (!prev) {
          return prev;
        }
        const srcIdx = prev.indexOf(draggingGroupId);
        if (srcIdx === -1) {
          return prev;
        }
        const next = [...prev];
        next.splice(srcIdx, 1);
        const insertAt = Math.min(gapIndex, next.length);
        next.splice(insertAt, 0, draggingGroupId);
        return next;
      });
    },
    [draggingGroupId],
  );

  const handleGroupGapDrop = useCallback(
    (_gapIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      commitDragGroupOrder();
      setDraggingGroupId(null);
      setDragOverGapIndex(null);
      setDragOverGroupId(null);
      setDragGroupOrder(null);
    },
    [commitDragGroupOrder],
  );

  const handleGroupGapDragLeave = useCallback((e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.contains(e.relatedTarget as Node)) {
      return;
    }
    setDragOverGapIndex(null);
  }, []);

  const handleItemDropOnGroup = useCallback(
    (groupId: string, e: React.DragEvent) => {
      const itemId = e.dataTransfer.getData("text/x-library-item-id");
      if (!itemId) return;
      getLibraryGroupActions().moveItem(itemId, {
        status: "published",
        groupId,
      });
    },
    [],
  );

  const commitDragGroupOrderRef = useRef(commitDragGroupOrder);
  commitDragGroupOrderRef.current = commitDragGroupOrder;

  useEffect(() => {
    const onDragEnd = () => {
      commitDragGroupOrderRef.current();
      setDraggingGroupId(null);
      setDragOverGroupId(null);
      setDragOverGapIndex(null);
      setDragGroupOrder(null);
      clearTabSwitchTimer();
      dragOriginTabRef.current = null;
      setReorderDropIndicator(null);
      setReorderDragSourceId(null);
    };
    document.addEventListener("dragend", onDragEnd);
    return () => {
      document.removeEventListener("dragend", onDragEnd);
      clearTabSwitchTimer();
    };
  }, [clearTabSwitchTimer]);

  // ---------------------------------------------------------------------------
  // Selection, insert, drag
  // ---------------------------------------------------------------------------

  const orderedItemsForSelection = useMemo(() => {
    if (IS_SEARCHING) {
      return filteredItems;
    }
    return libraryTab === "public" ? publishedItems : unpublishedItems;
  }, [IS_SEARCHING, filteredItems, libraryTab, publishedItems, unpublishedItems]);

  const onLibraryReorder = useCallback(
    (draggedId: string, targetId: string, placeAfter: boolean) => {
      if (draggedId === targetId) {
        return;
      }
      const isCrossTab =
        dragOriginTabRef.current != null &&
        dragOriginTabRef.current !== libraryTab;

      if (isCrossTab) {
        const targetStatus =
          libraryTab === "personal" ? "unpublished" : "published";
        const targetGroupId =
          libraryTab === "public"
            ? (groups.find((g) => g.itemIds.includes(targetId))?.id ?? undefined)
            : undefined;
        getLibraryGroupActions().moveItem(draggedId, {
          status: targetStatus,
          targetItemId: targetId,
          groupId: targetGroupId,
          placeAfter,
        });
        dragOriginTabRef.current = null;
        return;
      }

      const next =
        libraryTab === "public"
          ? reorderPublicBlock(libraryItems, draggedId, targetId, placeAfter)
          : reorderPersonalBlock(libraryItems, draggedId, targetId, placeAfter);
      if (libraryTab === "public") {
        getLibraryGroupActions().reorderItemWithinGroups(
          draggedId,
          targetId,
          next,
          placeAfter,
        );
      } else {
        library.setLibrary(next);
      }
    },
    [libraryTab, libraryItems, library, groups],
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
      dragOriginTabRef.current = libraryTab;
      setReorderDragSourceId(itemId);
    },
    [selectedItems, libraryTab],
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
      if (event.ctrlKey || event.metaKey) {
        setDetailItemId(clickedId);
        return;
      }
      onInsertLibraryItems(getInsertedElements(clickedId));
    },
    [getInsertedElements, onInsertLibraryItems],
  );

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

  const enableReorder =
    !IS_SEARCHING &&
    (libraryTab === "public"
      ? publishedItems.length > 1
      : unpublishedItems.length > 1);

  const handleReorderHoverChange = useCallback(
    (ind: LibraryReorderDropIndicator | null) => {
      setReorderDropIndicator(ind);
      if (!ind) {
        setDragOverGroupId(null);
        return;
      }
      if (libraryTab !== "public") {
        setDragOverGroupId(null);
        return;
      }
      const gid =
        groups.find((g) => g.itemIds.includes(ind.targetId))?.id ?? null;
      setDragOverGroupId(gid);
    },
    [libraryTab, groups],
  );

  const libraryGridReorderProps = useMemo(
    () => ({
      enableLibraryReorder: enableReorder,
      onReorderHoverChange: handleReorderHoverChange,
      reorderDragSourceId,
    }),
    [enableReorder, handleReorderHoverChange, reorderDragSourceId],
  );

  const selectedItemsSet = useMemo(
    () => new Set(selectedItems),
    [selectedItems],
  );

  // ---------------------------------------------------------------------------
  // Grouped published items for Public tab
  // ---------------------------------------------------------------------------

  const groupedSections = useMemo(() => {
    if (!groups.length) {
      return [] as {
        group: { id: string; name: string };
        items: LibraryItem[];
      }[];
    }
    const publishedMap = new Map(publishedItems.map((i) => [i.id, i]));
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const orderedGroupIds = dragGroupOrder ?? groups.map((g) => g.id);

    const sections: {
      group: { id: string; name: string };
      items: LibraryItem[];
    }[] = [];
    for (const gId of orderedGroupIds) {
      const g = groupMap.get(gId);
      if (!g) {
        continue;
      }
      const items: LibraryItem[] = [];
      for (const itemId of g.itemIds) {
        const item = publishedMap.get(itemId);
        if (item) {
          items.push(item);
        }
      }
      sections.push({ group: { id: g.id, name: g.name }, items });
    }
    return sections;
  }, [groups, publishedItems, dragGroupOrder]);

  const currentTabItems =
    libraryTab === "public" ? publishedItems : unpublishedItems;

  const handleSelectAll = useCallback(() => {
    const ids = currentTabItems.map((item) => item.id);
    onSelectItems(ids);
  }, [currentTabItems, onSelectItems]);

  const handleSelectUnnamed = useCallback(() => {
    const ids = currentTabItems
      .filter((item) => !item.name?.trim())
      .map((item) => item.id);
    onSelectItems(ids);
  }, [currentTabItems, onSelectItems]);

  // ---------------------------------------------------------------------------
  // JSX: Personal tab content
  // ---------------------------------------------------------------------------

  const renderPersonalContent = () => {
    if (!pendingElements.length && !unpublishedItems.length) {
      return (
        <div className="lib-empty">
          <div className="lib-empty__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="lib-empty__title">{t("library.noItems")}</div>
          <div className="lib-empty__hint">
            {publishedItems.length > 0
              ? t("library.hint_emptyPrivateLibrary")
              : t("library.hint_emptyLibrary")}
          </div>
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
          items={unpublishedItems}
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
  // JSX: Public tab content
  // ---------------------------------------------------------------------------

  const renderPublicContent = () => {
    if (publishedItems.length === 0 && groupedSections.length === 0) {
      return (
        <div className="lib-empty">
          <div className="lib-empty__hint">
            {t("library.hint_emptyPublicTab")}
          </div>
        </div>
      );
    }
    return (
      <LibraryMenuSectionGrid {...libraryGridReorderProps}>
        {groupedSections.length === 0 ? (
          <LibraryMenuSection
            itemsRenderedPerBatch={itemsRenderedPerBatch}
            items={publishedItems}
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
        ) : (
          <>
            {groupedSections.map((section, i) => (
              <React.Fragment key={section.group.id}>
                <GroupGapRow
                  gapIndex={i}
                  dragOverGapIndex={dragOverGapIndex}
                  draggingGroupId={draggingGroupId}
                  onGapDragOver={handleGroupGapDragOver}
                  onGapDrop={handleGroupGapDrop}
                  onGapDragLeave={handleGroupGapDragLeave}
                />
                <GroupDividerRow
                  groupId={section.group.id}
                  name={section.group.name}
                  collapsed={!!collapsedMap[section.group.id]}
                  itemCount={section.items.length}
                  allSelected={
                    section.items.length > 0 &&
                    section.items.every((item) =>
                      selectedItemsSet.has(item.id),
                    )
                  }
                  isDragging={draggingGroupId === section.group.id}
                  onToggleCollapse={handleToggleCollapse}
                  onRename={handleRenameGroup}
                  onDelete={handleDeleteGroup}
                  onSelectGroup={handleSelectGroup}
                  onGroupDragStart={handleGroupDragStart}
                  onGroupDragOver={handleGroupDragOver}
                  onGroupDrop={handleGroupDrop}
                  onItemDropOnGroup={handleItemDropOnGroup}
                  dragOverGroupId={dragOverGroupId}
                />
                {!collapsedMap[section.group.id] && (
                  <LibraryMenuSection
                    itemsRenderedPerBatch={itemsRenderedPerBatch}
                    items={section.items}
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
                )}
              </React.Fragment>
            ))}
            <GroupGapRow
              gapIndex={groupedSections.length}
              dragOverGapIndex={dragOverGapIndex}
              draggingGroupId={draggingGroupId}
              onGapDragOver={handleGroupGapDragOver}
              onGapDrop={handleGroupGapDrop}
              onGapDragLeave={handleGroupGapDragLeave}
            />
          </>
        )}
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
      {/* ZONE A: Search */}
      {!IS_LIBRARY_EMPTY && (
        <div className="lib-header">
          {/* ZONE B: Selection / action bar (always visible, above search) */}
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
            hasUnnamed={currentTabItems.some((item) => !item.name?.trim())}
            showNewGroup={libraryTab === "public"}
            onNewGroup={handleNewGroup}
          />

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

          {/* ZONE B2: Tabs */}
          <div className="lib-tab-row">
            <div className="lib-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={clsx("lib-tab", {
                  "lib-tab--active": libraryTab === "personal",
                })}
                aria-selected={libraryTab === "personal"}
                onClick={() => setLibraryTab("personal")}
                onDragOver={(e) => handleTabDragOver("personal", e)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleTabDrop("personal", e)}
              >
                {t("labels.libraryTabPersonal")}
              </button>
              <button
                type="button"
                role="tab"
                className={clsx("lib-tab", {
                  "lib-tab--active": libraryTab === "public",
                })}
                aria-selected={libraryTab === "public"}
                onClick={() => setLibraryTab("public")}
                onDragOver={(e) => handleTabDragOver("public", e)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleTabDrop("public", e)}
              >
                {t("labels.libraryTabPublic")}
              </button>
            </div>
          </div>
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
                {libraryTab === "personal" && renderPersonalContent()}
                {libraryTab === "public" && renderPublicContent()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
