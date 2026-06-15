/**
 * Combined library persistence adapter that merges three sources:
 * 1. Personal (server /api/library/personal) — private items
 * 2. Public (server /api/library) — globally shared items
 * 3. Canvas (server /api/library/files/:fileId) — items scoped to current drawing
 *
 * On load: fetches all three in parallel and merges into one list.
 * On save: Excalidraw core calls `save()` → {@link queueLibrarySync} → POST `/api/library/sync`
 * (debounced ~400ms) with personal / public / canvas payloads + group metadata — **持久化到后端**。
 *
 * Canvas `fileId`：`load()` 优先读当前 `location.hash`（`#file=`），避免首次打开时 `_currentFileId` 尚未写入而漏拉画布素材。
 *
 * Published-library groups + fold state: SQLite `library_groups` only (see /api/library/groups).
 */
import { get } from "idb-keyval";

import { createLogger } from "../lib/logger";

import type {
  LibraryPersistenceAdapter,
  LibraryPersistedData,
} from "@excalidraw/excalidraw/data/library";

import type { LibraryItem } from "@excalidraw/excalidraw/types";

import {
  computeGroupsForSync,
  getLibraryCollapsedMap,
  hydrateLibraryGroupsFromServer,
} from "../components/LibraryGroupEnhancer";
import { LIBRARY_IDB_KEY, queueLibrarySync } from "./librarySyncQueue";

const logLibrary = createLogger({ module: "library" });

function url(path: string): string {
  return `/api${path}`;
}

/** 与 app `getFileIdFromHash` 一致，避免 useEffect 设置 fileId 晚于首次 library load */
function fileIdFromLocationHash(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const m = window.location.hash.match(/^#file=(.+)$/);
  return m ? m[1] : null;
}

async function apiJson<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(url(path), {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    await res.text();
    throw new Error(
      `Library API ${path} expected JSON, got ${
        ct || "unknown"
      } (start Vite with /api proxy to server?)`,
    );
  }
  if (!res.ok) {
    throw new Error(`Library API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface ServerLibraryItem {
  id: string;
  scope: string;
  file_id: string | null;
  name: string;
  data: unknown;
  created_at: string;
  sort_index?: number;
}

/** Where the item is stored; not part of upstream {@link LibraryItem}. */
type LibraryScope = "personal" | "public" | "canvas";

type CombinedLibraryItem = LibraryItem & { scope?: LibraryScope };

function toLibraryScope(raw: string): LibraryScope {
  if (raw === "public" || raw === "canvas" || raw === "personal") {
    return raw;
  }
  return "personal";
}

function serverToLibraryItem(s: ServerLibraryItem): CombinedLibraryItem {
  const scope = toLibraryScope(s.scope);
  const published = s.scope === "public";
  return {
    id: s.id,
    status: published ? "published" : "unpublished",
    elements: (Array.isArray(s.data) ? s.data : []) as LibraryItem["elements"],
    created: new Date(s.created_at).getTime(),
    name: s.name || undefined,
    scope,
  };
}

let _currentFileId: string | null = null;

export function setCombinedLibraryFileId(fileId: string | null) {
  _currentFileId = fileId;
}

interface ServerLibraryGroup {
  id: string;
  name: string;
  itemIds: string[];
  collapsed?: boolean;
}

export const CombinedLibraryAdapter: LibraryPersistenceAdapter = {
  async load() {
    logLibrary.debug("load called");

    const canvasFileId = fileIdFromLocationHash() ?? _currentFileId;

    const [publicItems, canvasItems, personalRows, serverGroups, idbMirror] =
      await Promise.all([
        apiJson<ServerLibraryItem[]>("/library").catch(() => []),
        canvasFileId
          ? apiJson<ServerLibraryItem[]>(
              `/library/files/${canvasFileId}`,
            ).catch(() => [])
          : Promise.resolve([]),
        apiJson<ServerLibraryItem[]>("/library/personal").catch(() => []),
        apiJson<ServerLibraryGroup[]>("/library/groups").catch(
          () => [] as ServerLibraryGroup[],
        ),
        get(LIBRARY_IDB_KEY)
          .then((raw: unknown) => {
            if (!raw || typeof raw !== "string") {
              return [] as LibraryItem[];
            }
            try {
              const parsed = JSON.parse(raw);
              return (parsed?.libraryItems ?? []) as LibraryItem[];
            } catch {
              return [] as LibraryItem[];
            }
          })
          .catch(() => [] as LibraryItem[]),
      ]);

    hydrateLibraryGroupsFromServer(serverGroups);

    const personal: CombinedLibraryItem[] = personalRows.map(
      serverToLibraryItem,
    );
    const publicConverted = publicItems.map(serverToLibraryItem);
    const canvasConverted = canvasItems.map(serverToLibraryItem);

    const merged: CombinedLibraryItem[] = [
      ...canvasConverted,
      ...personal,
      ...publicConverted,
    ];

    const serverIds = new Set(merged.map((item) => item.id));
    for (const item of idbMirror) {
      if (!serverIds.has(item.id)) {
        merged.push(item);
      }
    }

    return { libraryItems: merged };
  },

  async save(libraryData: LibraryPersistedData) {
    logLibrary.debug("save called", {
      itemCount: libraryData.libraryItems.length,
    });
    const items = libraryData.libraryItems;

    const personalItems: Array<{
      id: string;
      name: string;
      data: unknown;
      created_at: string;
      sort_index: number;
    }> = [];
    const publicItems: Array<{
      id: string;
      name: string;
      data: unknown;
      created_at: string;
      sort_index: number;
    }> = [];
    const canvasItems: Array<{
      id: string;
      name: string;
      data: unknown;
      created_at: string;
      sort_index: number;
    }> = [];

    for (const item of items) {
      const combined = item as CombinedLibraryItem;
      const scope =
        combined.scope ??
        (item.status === "published" ? "public" : "personal");

      const base = {
        id: item.id,
        name: item.name || "",
        data: item.elements,
        created_at: new Date(item.created).toISOString(),
      };

      if (scope === "public") {
        publicItems.push({
          ...base,
          sort_index: publicItems.length,
        });
      } else if (scope === "canvas") {
        canvasItems.push({
          ...base,
          sort_index: canvasItems.length,
        });
      } else {
        personalItems.push({
          ...base,
          sort_index: personalItems.length,
        });
      }
    }

    const collapsedMap = getLibraryCollapsedMap();
    const groups = computeGroupsForSync(items as any).map((g, idx) => ({
      id: g.id,
      name: g.name,
      itemIds: g.itemIds,
      sort_index: idx,
      collapsed: !!collapsedMap[g.id],
    }));

    const syncBody = {
      publicItems,
      canvasItems,
      personalItems,
      fileId: _currentFileId,
      groups,
    };

    await queueLibrarySync(libraryData, syncBody);
  },
};
