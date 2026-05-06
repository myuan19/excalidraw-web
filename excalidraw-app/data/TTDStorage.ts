import { createStore, get, set } from "idb-keyval";

import type { SavedChats } from "@excalidraw/excalidraw/components/TTDDialog/types";

import { STORAGE_KEYS } from "../app_constants";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "TTDStorage" });

const IDB_NAME = STORAGE_KEYS.IDB_TTD_CHATS;
const IDB_KEY = "ttdChats";
const idbStore = createStore(`${IDB_NAME}-db`, `${IDB_NAME}-store`);

async function idbLoad(): Promise<SavedChats> {
  try {
    const data = (await get<SavedChats>(IDB_KEY, idbStore)) || [];
    log.debug("idbLoad done", { count: data.length });
    return data;
  } catch (err) {
    log.warn("idbLoad failed", { error: String(err) });
    return [];
  }
}

async function idbSave(chats: SavedChats): Promise<void> {
  try {
    await set(IDB_KEY, chats, idbStore);
    log.debug("idbSave done", { count: chats.length });
  } catch (err) {
    log.warn("idbSave failed", { error: String(err) });
  }
}

/**
 * TTD chat persistence adapter.
 * Primary: server /api/ttd-chats (SQLite).
 * Fallback: browser IndexedDB (offline / network failure).
 */
export class TTDIndexedDBAdapter {
  static async loadChats(): Promise<SavedChats> {
    log.info("loadChats called");
    try {
      const res = await fetch("/api/ttd-chats");
      log.debug("loadChats fetch response", { status: res.status, ok: res.ok });
      if (res.ok) {
        const data: SavedChats = await res.json();
        const isValid = Array.isArray(data);
        log.info("loadChats server result", {
          isArray: isValid,
          count: isValid ? data.length : 0,
        });
        if (isValid && data.length > 0) {
          void idbSave(data);
          return data;
        }
      }
    } catch (err) {
      log.warn("loadChats server fetch failed, falling back to IDB", {
        error: String(err),
      });
    }
    log.info("loadChats fallback to IndexedDB");
    return idbLoad();
  }

  static async saveChats(chats: SavedChats): Promise<void> {
    log.info("saveChats called", { count: chats.length });
    void idbSave(chats);
    try {
      const body = JSON.stringify(chats);
      log.debug("saveChats sending to server", { bodyBytes: body.length });
      const res = await fetch("/api/ttd-chats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      log.info("saveChats server response", { status: res.status, ok: res.ok });
      if (!res.ok) {
        const text = await res.text();
        log.warn("saveChats server rejected", { status: res.status, body: text });
      }
    } catch (err) {
      log.warn("saveChats server fetch failed", { error: String(err) });
    }
  }
}
