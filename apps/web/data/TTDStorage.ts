import { createStore, get, set } from "idb-keyval";

import type { SavedChats } from "@excalidraw/excalidraw/components/TTDDialog/types";

import { STORAGE_KEYS } from "../app_constants";

import { apiTransport } from "./apiTransport";

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
      const res = await apiTransport.request({
        method: "GET",
        path: "/api/ttd-chats",
      });
      if (res.status >= 200 && res.status < 300) {
        const data = JSON.parse(res.bodyText) as SavedChats;
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
      const res = await apiTransport.request({
        method: "PUT",
        path: "/api/ttd-chats",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chats),
      });
      if (res.status < 200 || res.status >= 300) {
        console.warn("[TTDStorage] server save failed:", res.status);
      }
    } catch (err) {
      console.warn("[TTDStorage] server save failed:", err);
    }
  }
}
