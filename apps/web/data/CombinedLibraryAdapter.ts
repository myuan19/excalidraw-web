/**
 * Combined library persistence adapter:
 * - Global (server /api/library/global) — merged personal + public
 * - Canvas (server /api/library/files/:fileId) — per-file items
 *
 * Save still maps published → public scope and unpublished → personal scope in SQLite.
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
import { apiTransport } from "./apiTransport";
import { LIBRARY_IDB_KEY, queueLibrarySync } from "./librarySyncQueue";

const logLibrary = createLogger({ module: "library" });

function apiPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith("/api/")) {
    return trimmed;
  }
  return `/api${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

async function apiJson<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  const body =
    opts.body == null
      ? null
      : typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);

  const res = await apiTransport.request({
    method: opts.method ?? "GET",
    path: apiPath(path),
    headers,
    body,
  });

  const ct = res.headers["content-type"] || res.headers["Content-Type"] || "";
  if (!ct.includes("application/json")) {
    throw new Error(
      `Library API ${path} expected JSON, got ${
        ct || "unknown"
      } (start Vite with /api proxy to server?)`,
    );
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Library API ${res.status}`);
  }
  return JSON.parse(res.bodyText) as T;
}

function fileIdFromLocationHash(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const m = window.location.hash.match(/^#file=(.+)$/);
  return m ? m[1] : null;
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

type CombinedLibraryItem = LibraryItem & {
  scope?: "global" | "canvas" | "personal" | "public";
};

function serverToLibraryItem(s: ServerLibraryItem): CombinedLibraryItem {
  if (s.scope === "canvas") {
    return {
      id: s.id,
      status: "unpublished",
      elements: (Array.isArray(s.data) ? s.data : []) as LibraryItem["elements"],
      created: new Date(s.created_at).getTime(),
      name: s.name || undefined,
      scope: "canvas",
    };
  }
  const published = s.scope === "public";
  return {
    id: s.id,
    status: published ? "published" : "unpublished",
    elements: (Array.isArray(s.data) ? s.data : []) as LibraryItem["elements"],
    created: new Date(s.created_at).getTime(),
    name: s.name || undefined,
    scope: "global",
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

    const [globalRows, canvasItems, serverGroups, idbMirror] =
      await Promise.all([
        apiJson<ServerLibraryItem[]>("/library/global").catch(() => []),
        canvasFileId
          ? apiJson<ServerLibraryItem[]>(
              `/library/files/${canvasFileId}`,
            ).catch(() => [])
          : Promise.resolve([]),
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

    const globalConverted = globalRows.map(serverToLibraryItem);
    const canvasConverted = canvasItems.map(serverToLibraryItem);

    const merged: CombinedLibraryItem[] = [
      ...canvasConverted,
      ...globalConverted,
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

      const base = {
        id: item.id,
        name: item.name || "",
        data: item.elements,
        created_at: new Date(item.created).toISOString(),
      };

      if (combined.scope === "canvas") {
        canvasItems.push({
          ...base,
          sort_index: canvasItems.length,
        });
      } else if (item.status === "published") {
        publicItems.push({
          ...base,
          sort_index: publicItems.length,
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
