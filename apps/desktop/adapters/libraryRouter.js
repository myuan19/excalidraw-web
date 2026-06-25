import fs from "node:fs";

import { Router } from "express";

import { resolveDesktopDataFile } from "./desktopDataDir.js";

function storePath() {
  return resolveDesktopDataFile("library-store.json");
}

function emptyStore() {
  return { items: [], groups: [] };
}

function readStore() {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return emptyStore();
    }
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  fs.writeFileSync(
    storePath(),
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
}

function mapItem(item) {
  const data =
    typeof item.data === "string"
      ? JSON.parse(item.data)
      : item.data ?? item.elements ?? [];
  return {
    id: item.id,
    scope: item.scope,
    file_id: item.file_id ?? null,
    name: item.name ?? "",
    data,
    created_at: item.created_at,
    sort_index: item.sort_index ?? 0,
  };
}

function sortItems(items) {
  return [...items].sort(
    (a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0) || a.id.localeCompare(b.id),
  );
}

/** Desktop library API — JSON persistence, no SQLite. */
export function createDesktopLibraryRouter() {
  const router = Router();

  router.get("/global", (_req, res) => {
    const store = readStore();
    const rows = sortItems(
      store.items.filter((item) => item.scope === "personal" || item.scope === "public"),
    );
    res.json(rows.map(mapItem));
  });

  router.get("/files/:fileId", (req, res) => {
    const store = readStore();
    const rows = sortItems(
      store.items.filter(
        (item) =>
          item.scope === "canvas" && item.file_id === req.params.fileId,
      ),
    );
    res.json(rows.map(mapItem));
  });

  router.get("/groups", (_req, res) => {
    const store = readStore();
    const rows = [...store.groups].sort(
      (a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0),
    );
    res.json(
      rows.map((group) => ({
        id: group.id,
        name: group.name ?? "",
        itemIds: Array.isArray(group.item_ids)
          ? group.item_ids
          : Array.isArray(group.itemIds)
            ? group.itemIds
            : JSON.parse(group.item_ids || "[]"),
        collapsed: !!group.collapsed,
      })),
    );
  });

  router.post("/sync", (req, res) => {
    const { publicItems, canvasItems, personalItems, fileId, groups } =
      req.body ?? {};
    const store = readStore();
    let items = [...store.items];

    const upsertScope = (scope, incoming, predicate) => {
      if (!Array.isArray(incoming)) {
        return;
      }
      const incomingIds = new Set(incoming.map((item) => item.id));
      items = items.filter(
        (item) => !predicate(item) || incomingIds.has(item.id),
      );
      incoming.forEach((item, idx) => {
        const row = {
          id: item.id,
          scope,
          file_id: scope === "canvas" ? fileId : null,
          name: item.name || "",
          data: JSON.stringify(item.data || item.elements || []),
          created_at: item.created_at || new Date().toISOString(),
          sort_index: item.sort_index ?? idx,
        };
        const at = items.findIndex((entry) => entry.id === row.id);
        if (at >= 0) {
          items[at] = row;
        } else {
          items.push(row);
        }
      });
    };

    upsertScope("public", publicItems, (item) => item.scope === "public");
    if (fileId) {
      upsertScope(
        "canvas",
        canvasItems,
        (item) => item.scope === "canvas" && item.file_id === fileId,
      );
    }
    upsertScope("personal", personalItems, (item) => item.scope === "personal");

    let nextGroups = store.groups;
    if (Array.isArray(groups)) {
      nextGroups = groups.map((group, idx) => ({
        id: group.id,
        name: group.name || "",
        item_ids: JSON.stringify(
          Array.isArray(group.itemIds) ? group.itemIds : [],
        ),
        sort_index: group.sort_index ?? idx,
        collapsed: group.collapsed ? 1 : 0,
      }));
    }

    writeStore({ items, groups: nextGroups });
    res.json({ ok: true });
  });

  return router;
}
