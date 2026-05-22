/**
 * Library Group Enhancer — data layer
 *
 * Manages library group state (CRUD, persistence, undo/redo) and exposes
 * changes via Jotai atoms so the React component tree can render groups.
 *
 * All DOM manipulation has been removed; rendering is handled by React
 * components in LibraryMenuItems.tsx.
 */

import "./LibraryGroupEnhancer.scss";

import {
  setLibraryGroups,
  setLibraryCollapsed,
} from "@excalidraw/excalidraw/data/libraryGroupsAtom";

import { registerLibraryGroupActions } from "@excalidraw/excalidraw/data/libraryGroupActions";
import type { LibraryGroup } from "@excalidraw/excalidraw/data/libraryGroupsAtom";

export type { LibraryGroup };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LibraryItemRecord {
  id: string;
  status: string;
  elements?: readonly unknown[];
  created?: number;
  name?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNGROUPED_ID = "__ungrouped__";

let persistedLibraryGroups: LibraryGroup[] | null = null;
let persistedCollapsed: Record<string, boolean> = {};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let excalidrawApi: any = null;
let allItems: LibraryItemRecord[] = [];

// Hydration guard: skip reconcile within this window after server hydrate
let lastHydrateTime = 0;
const HYDRATION_GUARD_MS = 3000;

// ---------------------------------------------------------------------------
// Group ID generation
// ---------------------------------------------------------------------------

function newGroupId(): string {
  return `nb-lib-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Library items
// ---------------------------------------------------------------------------

function getPublishedItems(items = allItems): LibraryItemRecord[] {
  return items.filter((i) => i.status === "published");
}

// ---------------------------------------------------------------------------
// Group persistence + atom emission
// ---------------------------------------------------------------------------

function parseGroupsArray(raw: unknown[]): LibraryGroup[] {
  return raw
    .map((g: any, idx: number) => {
      if (!g || typeof g !== "object") return null;
      const itemIds = Array.isArray(g.itemIds)
        ? g.itemIds.filter((id: unknown) => typeof id === "string" && id)
        : [];
      return {
        id: typeof g.id === "string" && g.id ? g.id : newGroupId(),
        name:
          typeof g.name === "string" && g.name.trim()
            ? g.name.trim()
            : `Group ${idx + 1}`,
        itemIds,
      } as LibraryGroup;
    })
    .filter(Boolean) as LibraryGroup[];
}

function loadGroups(): LibraryGroup[] {
  if (persistedLibraryGroups == null || persistedLibraryGroups.length === 0) {
    return [];
  }
  return parseGroupsArray(persistedLibraryGroups as unknown[]);
}

function saveGroups(groups: LibraryGroup[]): void {
  persistedLibraryGroups = groups.map((g) => ({
    id: g.id,
    name: g.name,
    itemIds: [...g.itemIds],
  }));
  setLibraryGroups(persistedLibraryGroups);
}

function loadCollapsed(): Record<string, boolean> {
  return { ...persistedCollapsed };
}

function saveCollapsed(state: Record<string, boolean>): void {
  persistedCollapsed = { ...state };
  setLibraryCollapsed(persistedCollapsed);
}

/** Apply authoritative state from GET /api/library/groups (server SQLite). */
export function hydrateLibraryGroupsFromServer(
  rows: Array<{
    id: string;
    name: string;
    itemIds: string[];
    collapsed?: boolean;
  }>,
): void {
  lastHydrateTime = Date.now();
  persistedLibraryGroups = rows.map((r, idx) => ({
    id: r.id?.trim() || newGroupId(),
    name: r.name?.trim() || `Group ${idx + 1}`,
    itemIds: Array.isArray(r.itemIds) ? r.itemIds.filter(Boolean) : [],
  }));
  persistedCollapsed = {};
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].collapsed && persistedLibraryGroups[i]) {
      persistedCollapsed[persistedLibraryGroups[i].id] = true;
    }
  }
  setLibraryGroups(persistedLibraryGroups);
  setLibraryCollapsed(persistedCollapsed);
}

/** For POST /api/library/sync — per-group fold flags */
export function getLibraryCollapsedMap(): Record<string, boolean> {
  return { ...persistedCollapsed };
}

// ---------------------------------------------------------------------------
// Reconcile groups with current published items
// ---------------------------------------------------------------------------

function reconcileGroups(
  items = allItems,
  rawGroups?: LibraryGroup[],
): LibraryGroup[] {
  const groups = rawGroups ?? loadGroups();
  const publishedIds = new Set(getPublishedItems(items).map((i) => i.id));
  const seen = new Set<string>();
  const result: LibraryGroup[] = [];

  for (const g of groups) {
    const validIds: string[] = [];
    for (const id of g.itemIds) {
      if (publishedIds.has(id) && !seen.has(id)) {
        seen.add(id);
        validIds.push(id);
      }
    }
    // Keep groups even if empty (allows "New Group" workflow)
    result.push({ id: g.id, name: g.name, itemIds: validIds });
  }
  return result;
}

/** Every published item must belong to some group (public tab has no ungrouped row). */
function assignOrphanPublishedItemsToGroups(
  groups: LibraryGroup[],
  items = allItems,
): LibraryGroup[] {
  const published = getPublishedItems(items);
  const publishedIds = new Set(published.map((i) => i.id));
  const assigned = new Set<string>();
  for (const g of groups) {
    for (const id of g.itemIds) {
      if (publishedIds.has(id)) {
        assigned.add(id);
      }
    }
  }
  const orphans = published.filter((i) => !assigned.has(i.id));
  if (orphans.length === 0) {
    return groups;
  }

  const next = groups.map((g) => ({
    ...g,
    itemIds: [...g.itemIds],
  }));

  if (next.length === 0) {
    next.push({
      id: newGroupId(),
      name: "默认分组",
      itemIds: orphans.map((o) => o.id),
    });
    return next;
  }

  // Prefer the last group that already has items. A newly appended empty group
  // must not absorb all orphans (otherwise "New group" steals every item).
  let targetIdx = next.length - 1;
  while (targetIdx >= 0 && next[targetIdx].itemIds.length === 0) {
    targetIdx--;
  }
  if (targetIdx < 0) {
    targetIdx = 0;
  }
  const target = next[targetIdx];
  for (const o of orphans) {
    if (!target.itemIds.includes(o.id)) {
      target.itemIds.push(o.id);
    }
  }
  return next;
}

/**
 * Remove redundant empty group rows: multiple server/UI placeholders collapse
 * to one; when at least one group already holds items, remove **all** empty
 * shells (e.g. URL 导入时按路径名建的 `forms` 空分组，而素材已在其它分组中).
 * When every group is empty, keep as-is (dedupe by name only).
 */
function dedupeEmptyGroups(
  groups: LibraryGroup[],
  _items: LibraryItemRecord[],
): LibraryGroup[] {
  const hasAnyWithItems = groups.some((g) => g.itemIds.length > 0);
  let next = hasAnyWithItems
    ? groups.filter((g) => g.itemIds.length > 0)
    : groups;
  if (next.length <= 1) {
    return next;
  }
  const seen = new Set<string>();
  return next.filter((g) => {
    if (g.itemIds.length > 0) {
      return true;
    }
    const key = g.name.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Pure: reconcile + orphan assignment + empty dedupe — no atom updates. */
export function computeGroupsForSync(
  items: LibraryItemRecord[],
): LibraryGroup[] {
  let groups = reconcileGroups(items);
  groups = assignOrphanPublishedItemsToGroups(groups, items);
  groups = dedupeEmptyGroups(groups, items);
  return groups;
}

function pruneCollapsed(
  groups: LibraryGroup[],
  collapsed?: Record<string, boolean>,
): Record<string, boolean> {
  const c = collapsed ?? loadCollapsed();
  const validIds = new Set([...groups.map((g) => g.id), UNGROUPED_ID]);
  return Object.fromEntries(
    Object.entries(c).filter(([k]) => validIds.has(k)),
  );
}

function syncGroupState(items = allItems): LibraryGroup[] {
  const sinceHydrate = Date.now() - lastHydrateTime;
  if (sinceHydrate < HYDRATION_GUARD_MS) {
    return loadGroups();
  }
  const groups = computeGroupsForSync(items);
  saveGroups(groups);
  saveCollapsed(pruneCollapsed(groups));
  return groups;
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

interface UndoSnapshot {
  items: LibraryItemRecord[];
  groups: string | null;
  collapsed: string | null;
}

const undoStack: UndoSnapshot[] = [];
const redoStack: UndoSnapshot[] = [];
let lastUndoTime = 0;
const MAX_UNDO = 50;

function captureSnapshot(): UndoSnapshot {
  return {
    items: JSON.parse(JSON.stringify(allItems)),
    groups:
      persistedLibraryGroups != null && persistedLibraryGroups.length > 0
        ? JSON.stringify(persistedLibraryGroups)
        : null,
    collapsed:
      Object.keys(persistedCollapsed).length > 0
        ? JSON.stringify(persistedCollapsed)
        : null,
  };
}

function pushUndo(): void {
  undoStack.push(captureSnapshot());
  redoStack.length = 0;
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  lastUndoTime = Date.now();
}

function applySnapshot(snap: UndoSnapshot): void {
  allItems = snap.items;
  if (snap.groups != null) {
    try {
      const parsed = JSON.parse(snap.groups) as unknown;
      persistedLibraryGroups = Array.isArray(parsed)
        ? parseGroupsArray(parsed as unknown[])
        : [];
    } catch {
      persistedLibraryGroups = [];
    }
  } else {
    persistedLibraryGroups = [];
  }
  if (snap.collapsed != null) {
    try {
      const parsed = JSON.parse(snap.collapsed) as unknown;
      persistedCollapsed =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? { ...(parsed as Record<string, boolean>) }
          : {};
    } catch {
      persistedCollapsed = {};
    }
  } else {
    persistedCollapsed = {};
  }
  setLibraryGroups(persistedLibraryGroups);
  setLibraryCollapsed(persistedCollapsed);
  if (excalidrawApi) {
    excalidrawApi.updateLibrary({
      libraryItems: snap.items,
      merge: false,
      openLibraryMenu: true,
    });
  }
}

function undo(): boolean {
  if (!undoStack.length) return false;
  redoStack.push(captureSnapshot());
  applySnapshot(undoStack.pop()!);
  lastUndoTime = Date.now();
  return true;
}

function redo(): boolean {
  if (!redoStack.length) return false;
  undoStack.push(captureSnapshot());
  applySnapshot(redoStack.pop()!);
  lastUndoTime = Date.now();
  return true;
}

function isRecentLibraryAction(): boolean {
  return Date.now() - lastUndoTime < 8000;
}

// ---------------------------------------------------------------------------
// Commit library state (items + groups)
// ---------------------------------------------------------------------------

function commitLibraryState(
  items: LibraryItemRecord[],
  groups?: LibraryGroup[],
  opts: { skipUndo?: boolean } = {},
): void {
  if (!opts.skipUndo) pushUndo();

  allItems = items;
  let reconciled = reconcileGroups(items, groups);
  reconciled = assignOrphanPublishedItemsToGroups(reconciled, items);
  reconciled = dedupeEmptyGroups(reconciled, items);
  saveGroups(reconciled);
  saveCollapsed(pruneCollapsed(reconciled));

  if (excalidrawApi) {
    excalidrawApi.updateLibrary({
      libraryItems: items,
      merge: false,
      openLibraryMenu: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Move a single item (change status, reorder, move between groups)
// ---------------------------------------------------------------------------

function resolveItemStatus(
  existing: LibraryItemRecord | null,
  neighbor: LibraryItemRecord | null,
): string {
  if (neighbor?.status && neighbor.status !== "published")
    return neighbor.status;
  if (existing?.status && existing.status !== "published")
    return existing.status;
  return "unpublished";
}

function findItem(id: string, items = allItems): LibraryItemRecord | null {
  return items.find((i) => i.id === id) ?? null;
}

export function moveItem(
  itemId: string,
  opts: {
    status?: string;
    groupId?: string;
    targetItemId?: string;
    placeAfter?: boolean;
  } = {},
): void {
  const items = allItems.map((i) => ({ ...i }));
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return;

  const [item] = items.splice(idx, 1);
  const target = opts.targetItemId
    ? items.find((i) => i.id === opts.targetItemId) ?? null
    : null;

  item.status =
    opts.status === "published"
      ? "published"
      : resolveItemStatus(item, target);

  let insertIdx: number;
  if (opts.targetItemId) {
    const tIdx = items.findIndex((i) => i.id === opts.targetItemId);
    insertIdx =
      tIdx !== -1 ? (opts.placeAfter ? tIdx + 1 : tIdx) : items.length;
  } else if (item.status === "published") {
    const lastPublished = items.findLastIndex((i) => i.status === "published");
    insertIdx = lastPublished !== -1 ? lastPublished + 1 : items.length;
  } else {
    const firstOfStatus = items.findIndex((i) => i.status === item.status);
    insertIdx = firstOfStatus !== -1 ? firstOfStatus : 0;
  }
  items.splice(insertIdx, 0, item);

  const groups = cloneGroups();
  removeFromAllGroups(groups, itemId);
  if (item.status === "published" && opts.groupId) {
    addToGroup(groups, opts.groupId, itemId, opts);
  }

  commitLibraryState(items, groups);
}

// ---------------------------------------------------------------------------
// Group helpers
// ---------------------------------------------------------------------------

function cloneGroups(): LibraryGroup[] {
  return reconcileGroups().map((g) => ({
    ...g,
    itemIds: [...g.itemIds],
  }));
}

function removeFromAllGroups(groups: LibraryGroup[], itemId: string): void {
  for (const g of groups) {
    g.itemIds = g.itemIds.filter((id) => id !== itemId);
  }
}

function addToGroup(
  groups: LibraryGroup[],
  groupId: string,
  itemId: string,
  opts: { targetItemId?: string; placeAfter?: boolean } = {},
): void {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return;
  const targetIdx = opts.targetItemId
    ? group.itemIds.indexOf(opts.targetItemId)
    : -1;
  if (targetIdx === -1) {
    group.itemIds.push(itemId);
  } else {
    group.itemIds.splice(
      opts.placeAfter ? targetIdx + 1 : targetIdx,
      0,
      itemId,
    );
  }
}

export function findGroupForItem(
  groups: LibraryGroup[],
  itemId: string,
): string | null {
  const g = groups.find((gr) => gr.itemIds.includes(itemId));
  return g ? g.id : null;
}

// ---------------------------------------------------------------------------
// Item reorder within / across groups
// ---------------------------------------------------------------------------

export function reorderItemWithinGroups(
  draggedId: string,
  targetId: string,
  orderedLibraryItems?: readonly LibraryItemRecord[],
  placeAfter = false,
): void {
  const groups = cloneGroups();
  removeFromAllGroups(groups, draggedId);
  const tgtGroup = groups.find((g) => g.itemIds.includes(targetId));
  if (tgtGroup) {
    let tgtIdx = tgtGroup.itemIds.indexOf(targetId);
    if (tgtIdx !== -1) {
      if (placeAfter) {
        tgtIdx += 1;
      }
      tgtGroup.itemIds.splice(tgtIdx, 0, draggedId);
    } else {
      tgtGroup.itemIds.push(draggedId);
    }
  }

  const itemsToCommit = orderedLibraryItems
    ? orderedLibraryItems.map((i) => ({ ...i }))
    : allItems.map((i) => ({ ...i }));
  commitLibraryState(itemsToCommit, groups);
}

// ---------------------------------------------------------------------------
// Group reorder
// ---------------------------------------------------------------------------

export function reorderGroup(
  sourceId: string,
  targetId: string,
  placeAfter: boolean,
): void {
  if (!sourceId || !targetId || sourceId === targetId) return;

  const groups = cloneGroups();
  const srcIdx = groups.findIndex((g) => g.id === sourceId);
  const tgtIdx = groups.findIndex((g) => g.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [removed] = groups.splice(srcIdx, 1);
  const newTgtIdx = groups.findIndex((g) => g.id === targetId);
  groups.splice(placeAfter ? newTgtIdx + 1 : newTgtIdx, 0, removed);

  commitLibraryState(allItems, groups);
}

/**
 * Move a group to a gap index: 0 = before first group, n = after last
 * (n = group count before the move).
 */
export function reorderGroupToGap(sourceId: string, gapIndex: number): void {
  const groups = cloneGroups();
  const n = groups.length;
  const srcIdx = groups.findIndex((g) => g.id === sourceId);
  if (srcIdx === -1) return;
  if (gapIndex < 0 || gapIndex > n) return;

  const [removed] = groups.splice(srcIdx, 1);
  let insertAt = gapIndex;
  if (gapIndex > srcIdx) {
    insertAt--;
  }
  insertAt = Math.max(0, Math.min(insertAt, groups.length));
  groups.splice(insertAt, 0, removed);

  commitLibraryState(allItems, groups);
}

// ---------------------------------------------------------------------------
// Delete group and all items contained in that group
// ---------------------------------------------------------------------------

export function deleteGroup(groupId: string): void {
  const groups = reconcileGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return;

  const removeIds = new Set(group.itemIds);
  const remainingItems = allItems.filter((i) => !removeIds.has(i.id));
  const remaining = groups.filter((g) => g.id !== groupId);

  commitLibraryState(remainingItems, remaining);
}

// ---------------------------------------------------------------------------
// Create group
// ---------------------------------------------------------------------------

export function createGroup(name: string, itemIds?: string[]): void {
  if (!name) return;
  const filtered = (itemIds ?? []).filter(
    (id) => typeof id === "string" && id,
  );

  const groups = reconcileGroups();
  const cleaned = groups.map((g) => ({
    ...g,
    itemIds: g.itemIds.filter((id) => !filtered.includes(id)),
  }));

  const newId = newGroupId();
  cleaned.push({ id: newId, name, itemIds: filtered });
  commitLibraryState(allItems, cleaned);
}

// ---------------------------------------------------------------------------
// Rename group
// ---------------------------------------------------------------------------

export function renameGroup(groupId: string, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const groups = reconcileGroups().map((g) =>
    g.id === groupId ? { ...g, name: trimmed } : g,
  );
  commitLibraryState(allItems, groups);
}

// ---------------------------------------------------------------------------
// Toggle collapsed
// ---------------------------------------------------------------------------

export function toggleGroupCollapsed(groupId: string): void {
  const c = loadCollapsed();
  c[groupId] = !c[groupId];
  if (!c[groupId]) delete c[groupId];
  saveCollapsed(c);
}

// ---------------------------------------------------------------------------
// URL import auto-group
// ---------------------------------------------------------------------------

function deriveGroupNameFromLibraryUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() || "";
    let base = seg.replace(/\.excalidrawlib$/i, "").trim();
    try {
      base = decodeURIComponent(base);
    } catch {
      /* keep base */
    }
    if (base) return base;
    return u.hostname.replace(/^www\./i, "") || "Library";
  } catch {
    return "Library";
  }
}

export function autoCreateGroupFromUrlImport(
  libraryUrl: string,
  addedItemIds: string[],
): void {
  if (!addedItemIds.length) return;
  const name = deriveGroupNameFromLibraryUrl(libraryUrl);
  createGroup(name, addedItemIds);
}

// ---------------------------------------------------------------------------
// Keyboard handler for library undo/redo
// ---------------------------------------------------------------------------

function handleKeyDown(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return;

  const isUndo = e.key === "z" && !e.shiftKey;
  const isRedo = (e.key === "z" && e.shiftKey) || e.key === "y";
  if (!isUndo && !isRedo) return;

  const libPanel = document.querySelector(".layer-ui__library");
  if (!libPanel) return;

  const recent = isRecentLibraryAction();
  const focusInLib = libPanel.contains(document.activeElement);
  if (!recent && !focusInLib) return;

  if (isUndo && undoStack.length) {
    e.preventDefault();
    e.stopPropagation();
    undo();
  } else if (isRedo && redoStack.length) {
    e.preventDefault();
    e.stopPropagation();
    redo();
  }
}

// ---------------------------------------------------------------------------
// Public API: mount / unmount
// ---------------------------------------------------------------------------

let mounted = false;

export function mountLibraryGroupEnhancer(api: any): () => void {
  if (mounted) return () => {};
  mounted = true;
  excalidrawApi = api;

  registerLibraryGroupActions({
    toggleGroupCollapsed,
    renameGroup,
    deleteGroup,
    createGroup,
    reorderGroup,
    reorderGroupToGap,
    reorderItemWithinGroups,
    moveItem,
    findGroupForItem,
  });

  document.addEventListener("keydown", handleKeyDown, true);

  return () => {
    mounted = false;
    excalidrawApi = null;
    document.removeEventListener("keydown", handleKeyDown, true);
  };
}

/**
 * Called from Excalidraw's onLibraryChange to keep local item state in sync.
 */
export function syncLibraryItems(items: readonly LibraryItemRecord[]): void {
  allItems = items.map((i) => ({
    id: i.id,
    status: i.status ?? "unpublished",
    elements: i.elements,
    created: i.created,
    name: i.name,
  }));
  syncGroupState(allItems);
}

export { loadGroups, syncGroupState };
