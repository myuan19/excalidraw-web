import { createStore, get, set } from "idb-keyval";

import type { SavedChats } from "@excalidraw/excalidraw/components/TTDDialog/types";

import { STORAGE_KEYS } from "../app_constants";

const IDB_NAME = STORAGE_KEYS.IDB_TTD_CHATS;
const IDB_KEY = "ttdChats";
const idbStore = createStore(`${IDB_NAME}-db`, `${IDB_NAME}-store`);

async function idbLoad(): Promise<SavedChats> {
  try {
    return (await get<SavedChats>(IDB_KEY, idbStore)) || [];
  } catch {
    return [];
  }
}

async function idbSave(chats: SavedChats): Promise<void> {
  try {
    await set(IDB_KEY, chats, idbStore);
  } catch {
    // quota / private mode
  }
}

/**
 * TTD chat persistence adapter.
 * Primary: server /api/ttd-chats (SQLite).
 * Fallback: browser IndexedDB (offline / network failure).
 */
export class TTDIndexedDBAdapter {
  static async loadChats(): Promise<SavedChats> {
    try {
      const res = await fetch("/api/ttd-chats");
      if (res.ok) {
        const data: SavedChats = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          void idbSave(data);
          return data;
        }
      }
    } catch {
      // network error — fall through to IndexedDB
    }
    return idbLoad();
  }

  static async saveChats(chats: SavedChats): Promise<void> {
    void idbSave(chats);
    try {
      const res = await fetch("/api/ttd-chats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chats),
      });
      if (!res.ok) {
        console.warn("[TTDStorage] server save failed:", res.status);
      }
    } catch (err) {
      console.warn("[TTDStorage] server save failed:", err);
    }
  }
}
