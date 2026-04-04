/**
 * 将 Excalidraw {@link StoreDelta} 序列化为可 JSON 持久化的纯对象，并在加载时还原。
 * 与 {@link History.record} 一致：撤销栈存的是 inverse(delta)，恢复时由调用方处理。
 */

import {
  AppStateDelta,
  Delta,
  ElementsDelta,
  StoreDelta,
} from "@excalidraw/element";

function serializeDeltaRecord<T>(
  rec: Record<string, Delta<T>>,
): Record<string, { deleted: unknown; inserted: unknown }> {
  const out: Record<string, { deleted: unknown; inserted: unknown }> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = { deleted: v.deleted, inserted: v.inserted };
  }
  return out;
}

/** 将 durable increment 的 delta 转为可写入 IndexedDB / localStorage 的 DTO */
export function storeDeltaToPersistDto(delta: StoreDelta): unknown {
  const el = delta.elements;
  return {
    v: 1,
    id: delta.id,
    elements: {
      added: serializeDeltaRecord(el.added),
      removed: serializeDeltaRecord(el.removed),
      updated: serializeDeltaRecord(el.updated),
    },
    appState: {
      delta: {
        deleted: delta.appState.delta.deleted,
        inserted: delta.appState.delta.inserted,
      },
    },
  };
}

function reviveElementDeltaRecord(
  rec: Record<string, { deleted: unknown; inserted: unknown }>,
): Record<string, Delta<Record<string, unknown>>> {
  const out: Record<string, Delta<Record<string, unknown>>> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = Delta.create(
      v.deleted as Record<string, unknown>,
      v.inserted as Record<string, unknown>,
    );
  }
  return out;
}

/** 从持久化 DTO 还原 StoreDelta；失败返回 null */
export function persistDtoToStoreDelta(dto: unknown): StoreDelta | null {
  try {
    if (!dto || typeof dto !== "object") {
      return null;
    }
    const d = dto as Record<string, unknown>;
    const id = d.id;
    if (typeof id !== "string") {
      return null;
    }
    const els = d.elements as {
      added: Record<string, { deleted: unknown; inserted: unknown }>;
      removed: Record<string, { deleted: unknown; inserted: unknown }>;
      updated: Record<string, { deleted: unknown; inserted: unknown }>;
    };
    if (!els?.added || !els?.removed || !els?.updated) {
      return null;
    }
    const elements = ElementsDelta.create(
      reviveElementDeltaRecord(els.added) as any,
      reviveElementDeltaRecord(els.removed) as any,
      reviveElementDeltaRecord(els.updated) as any,
    );
    const as = d.appState as {
      delta: { deleted: unknown; inserted: unknown };
    };
    if (!as?.delta) {
      return null;
    }
    const appState = AppStateDelta.create(
      Delta.create(as.delta.deleted as any, as.delta.inserted as any),
    );
    return StoreDelta.create(elements, appState, { id });
  } catch {
    return null;
  }
}
