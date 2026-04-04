/**
 * 持久化 Excalidraw 的 durable {@link StoreDelta}（可 JSON 序列化），供刷新后恢复撤销栈。
 * 与内存中的撤销/重做一致：与 {@link History.record} 相同，栈内存 inverse(delta)。
 */

import { createStore, get, set, del, keys } from "idb-keyval";

import type { StoreDelta } from "@excalidraw/element";

import { persistDtoToStoreDelta, storeDeltaToPersistDto } from "./storeDeltaPersist";

/** 单文件最多保留的 durable 步数（与历史深度同量级） */
const MAX_PERSISTED_DELTAS = 80;

const store = createStore("excalidraw-deltas-db", "deltas-store");

const META_KEY = "__meta__";

interface DeltaMeta {
  counter: number;
  fileId: string | null;
}

interface StoredEnvelope {
  schema: 2;
  payload: unknown;
}

async function getMeta(): Promise<DeltaMeta> {
  const m = await get<DeltaMeta>(META_KEY, store);
  return m ?? { counter: 0, fileId: null };
}

async function setMeta(m: DeltaMeta) {
  await set(META_KEY, m, store);
}

export class DeltaStorage {
  /** 记录一次 durable increment 的完整 delta（JSON 安全） */
  static async recordStoreDelta(delta: StoreDelta): Promise<void> {
    const dto = storeDeltaToPersistDto(delta);
    const meta = await getMeta();
    meta.counter += 1;
    const key = `d:${meta.counter}`;
    const envelope: StoredEnvelope = { schema: 2, payload: dto };
    await set(key, envelope, store);
    await setMeta(meta);

    if (meta.counter > MAX_PERSISTED_DELTAS) {
      const oldest = `d:${meta.counter - MAX_PERSISTED_DELTAS}`;
      await del(oldest, store).catch(() => {});
    }
  }

  /** 按时间顺序返回可还原的 StoreDelta DTO 列表（用于恢复撤销栈） */
  static async getAllPersistedDtos(): Promise<unknown[]> {
    const allKeys = (await keys(store)) as string[];
    const deltaKeys = allKeys
      .filter((k) => typeof k === "string" && k.startsWith("d:"))
      .sort((a, b) => {
        const na = parseInt(a.slice(2), 10);
        const nb = parseInt(b.slice(2), 10);
        return na - nb;
      });

    const results: unknown[] = [];
    for (const k of deltaKeys) {
      const v = await get(k, store);
      if (v && typeof v === "object" && "schema" in v && (v as StoredEnvelope).schema === 2) {
        results.push((v as StoredEnvelope).payload);
      }
    }
    return results;
  }

  static async clear(): Promise<void> {
    const allKeys = (await keys(store)) as string[];
    for (const k of allKeys) {
      await del(k, store);
    }
  }

  /** 从 localStorage 暂存恢复时写入整段快照 */
  static async restoreSnapshot(deltas: unknown[]): Promise<void> {
    const meta = await getMeta();
    const fileId = meta.fileId;
    const allKeys = (await keys(store)) as string[];
    for (const k of allKeys) {
      if (typeof k === "string" && k.startsWith("d:")) {
        await del(k, store);
      }
    }
    let counter = 0;
    for (const raw of deltas) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const r = raw as Record<string, unknown>;
      let payload: unknown = raw;
      if (r.schema === 2 && "payload" in r) {
        payload = r.payload;
      }
      if (
        "id" in r &&
        "timestamp" in r &&
        !("elements" in r) &&
        !(r.schema === 2)
      ) {
        continue;
      }
      if (persistDtoToStoreDelta(payload) === null) {
        continue;
      }
      counter += 1;
      await set(`d:${counter}`, { schema: 2, payload } as StoredEnvelope, store);
    }
    await setMeta({ counter, fileId });
  }

  static async setFileId(fileId: string | null): Promise<void> {
    const meta = await getMeta();
    if (meta.fileId !== fileId) {
      await this.clear();
      await setMeta({ counter: 0, fileId });
    }
  }

  static async getFileId(): Promise<string | null> {
    const meta = await getMeta();
    return meta.fileId;
  }
}
