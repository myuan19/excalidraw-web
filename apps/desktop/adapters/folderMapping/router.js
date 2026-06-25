import { existsSync, watch } from "fs";
import path from "path";

import { Router } from "express";

import {
  logFilesOperation,
  logFilesRequest,
  logGetFile,
  logPutFile,
} from "./desktopFilesLog.mjs";
import { createFolderMappingStore } from "./store.js";
import {
  isSidecarWatchPath,
  normalizeWatchPath,
  shouldScheduleRescanForWatchPath,
} from "./watchPathPolicy.js";
import {
  formatTreeListingEtag,
  ifNoneMatchAllowsTree,
} from "./treeListingEtag.js";

function formatDocumentEtag(contentSha256) {
  return contentSha256
    ? `"${String(contentSha256).replace(/^"|"$/g, "")}"`
    : null;
}

function sendNotModified(res, contentSha256) {
  const etag = formatDocumentEtag(contentSha256);
  if (etag) {
    res.setHeader("ETag", etag);
  }
  res.setHeader("Cache-Control", "private, no-cache");
  return res.status(304).end();
}

function sendStoreError(res, error) {
  const status = error?.status ?? 500;
  if (status === 409 && error?.payload) {
    return res.status(status).json(error.payload);
  }
  return res.status(status).json({
    error: error instanceof Error ? error.message : String(error),
    ...(error?.code ? { code: error.code } : {}),
  });
}

function runStore(res, fn) {
  try {
    return fn();
  } catch (error) {
    sendStoreError(res, error);
    return undefined;
  }
}

function createFilesystemWatcher({ store, workspacePath }) {
  const clients = new Set();
  const watchers = new Map();
  const changeListeners = new Set();
  let debounceTimer = null;

  const send = (payload) => {
    const eventPayload = {
      ...payload,
      at: payload?.at ?? new Date().toISOString(),
    };
    const data = `event: change\ndata: ${JSON.stringify(eventPayload)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
    for (const listener of changeListeners) {
      try {
        listener(eventPayload);
      } catch (error) {
        logFilesOperation("catalog-change-listener-error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const scheduleChange = (payload) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      send(payload);
    }, 250);
  };

  const readRoots = () => {
    let meta;
    try {
      meta = store.sidecar.load();
    } catch {
      meta = { mapping_roots: [] };
    }
    return [
      workspacePath,
      ...(meta.mapping_roots ?? [])
        .map((root) => root?.absPath)
        .filter(Boolean),
    ]
      .map((root) => path.resolve(root))
      .filter((root, index, roots) => {
        if (!existsSync(root)) {
          return false;
        }
        return roots.indexOf(root) === index;
      });
  };

  const syncRoots = () => {
    const roots = new Set(readRoots());
    for (const [root, watcher] of watchers) {
      if (!roots.has(root)) {
        watcher.close();
        watchers.delete(root);
      }
    }
    for (const root of roots) {
      if (watchers.has(root)) {
        continue;
      }
      try {
        const watcher = watch(
          root,
          { recursive: true },
          (eventType, fileName) => {
            const relPath = normalizeWatchPath(fileName);
            if (isSidecarWatchPath(fileName)) {
              logFilesOperation("[DEBUG] catalog-watch | ignored-sidecar", {
                eventType,
                root,
                path: relPath,
              });
              return;
            }
            if (!shouldScheduleRescanForWatchPath(relPath)) {
              logFilesOperation("[DEBUG] catalog-watch | ignored-path", {
                eventType,
                root,
                path: relPath,
                hasFileName: fileName != null && String(fileName).length > 0,
              });
              return;
            }
            logFilesOperation("[DEBUG] catalog-watch | fs-event", {
              eventType,
              root,
              path: relPath,
              hasFileName: fileName != null && String(fileName).length > 0,
            });
            scheduleChange({ eventType, root, path: relPath });
            store.scheduleRescan({
              source: "watcher",
              eventType,
              root,
              path: relPath,
              hasFileName: fileName != null && String(fileName).length > 0,
            });
          },
        );
        watcher.on("error", (error) => {
          logFilesOperation("watch-error", {
            root,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        watchers.set(root, watcher);
      } catch (error) {
        logFilesOperation("watch-start-failed", {
          root,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const addClient = (req, res) => {
    syncRoots();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
  };

  const onChange = (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  };

  return {
    addClient,
    syncRoots,
    scheduleChange,
    onChange,
    close() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      clients.clear();
      changeListeners.clear();
    },
  };
}

export async function createFolderMappingRouter({
  workspacePath,
  openLocalPath,
  showLocalItemInFolder,
} = {}) {
  if (!workspacePath) {
    throw new Error("createFolderMappingRouter requires workspacePath");
  }

  let scheduleCatalogRefresh = () => {};
  const store = createFolderMappingStore({
    workspacePath,
    archivesEnabled: false,
    onCatalogUpdated: (status) => {
      logFilesOperation("[DEBUG] catalog-scan | updated", {
        state: status?.state ?? null,
        pass: status?.pass ?? null,
        folders: status?.folders ?? null,
        files: status?.files ?? null,
        processed: status?.processed ?? null,
        error: status?.error ?? null,
      });
      if (status?.state === "running") {
        return;
      }
      scheduleCatalogRefresh({ reason: status?.state ?? "catalog-updated" });
    },
  });
  const router = Router();
  const filesystemWatcher = createFilesystemWatcher({ store, workspacePath });
  scheduleCatalogRefresh = (payload) => {
    logFilesOperation("[DEBUG] catalog-watch | schedule-change", {
      reason: payload?.reason ?? null,
      eventType: payload?.eventType ?? null,
      path: payload?.path ?? null,
      root: payload?.root ?? null,
    });
    filesystemWatcher.scheduleChange(payload);
  };

  store.scheduleRescan({ source: "router-ready" });

  logFilesOperation("router-ready", {
    workspacePath,
    adapter: "FolderMappingStore",
  });

  router.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => logFilesRequest(req, res, startedAt));
    next();
  });

  router.get("/capabilities", (_req, res) => {
    res.json(store.getCapabilities());
  });

  router.get("/scan-status", (_req, res) => {
    res.json(store.getScanStatus());
  });

  router.post("/mapping-roots", (req, res) => {
    const absPath =
      typeof req.body.absPath === "string"
        ? req.body.absPath
        : typeof req.body.path === "string"
        ? req.body.path
        : "";
    const parentFolderId =
      typeof req.body.parent_folder_id === "string"
        ? req.body.parent_folder_id
        : typeof req.body.parent_id === "string"
        ? req.body.parent_id
        : null;
    const result = runStore(res, () =>
      store.addMappingRoot(absPath, parentFolderId),
    );
    if (!result) {
      return undefined;
    }
    logFilesOperation("[DEBUG] mapping-root | add-result", {
      absPath,
      folderId: result.folder?.id ?? null,
      folderName: result.folder?.name ?? null,
      treeFolders: result.tree?.folders?.length ?? null,
      treeFiles: result.tree?.files?.length ?? null,
      scanState: result.scan?.state ?? result.tree?.scan?.state ?? null,
      scanPass: result.scan?.pass ?? result.tree?.scan?.pass ?? null,
    });
    filesystemWatcher.syncRoots();
    return res.status(201).json(result);
  });

  router.get("/watch-events", (req, res) => {
    filesystemWatcher.addClient(req, res);
  });

  router.post("/rescan", (_req, res) => {
    const result = runStore(res, () => store.rescan());
    if (!result) {
      return undefined;
    }
    return res.status(202).json(result);
  });

  router.post("/resolve-path", (req, res) => {
    const absPath =
      typeof req.body?.absPath === "string" ? req.body.absPath.trim() : "";
    logFilesOperation("[DEBUG] resolve-path | start", { absPath });
    try {
      const result = store.resolveFileByAbsPath(absPath);
      logFilesOperation("[DEBUG] resolve-path | ok", {
        absPath,
        id: result.file?.id,
        kind: result.file?.kind,
        health: result.file?.health ?? null,
        hasThumbnail: !!result.file?.has_thumbnail,
        contentSha: result.file?.content_sha256 ?? null,
      });
      return res.json(result);
    } catch (error) {
      logFilesOperation("[DEBUG] resolve-path | error", {
        absPath,
        status: error?.status ?? 500,
        code: error?.code ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      sendStoreError(res, error);
      return undefined;
    }
  });

  router.post("/track-path", (req, res) => {
    const absPath =
      typeof req.body?.absPath === "string" ? req.body.absPath.trim() : "";
    logFilesOperation("[DEBUG] track-path | start", { absPath });
    try {
      const result = store.trackFileByAbsPath(absPath);
      logFilesOperation("[DEBUG] track-path | ok", {
        absPath,
        tracked: !!result.tracked,
        id: result.file?.id,
        kind: result.file?.kind,
        health: result.file?.health ?? null,
        hasThumbnail: !!result.file?.has_thumbnail,
        contentSha: result.file?.content_sha256 ?? null,
      });
      return res.json(result);
    } catch (error) {
      logFilesOperation("[DEBUG] track-path | error", {
        absPath,
        status: error?.status ?? 500,
        code: error?.code ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      sendStoreError(res, error);
      return undefined;
    }
  });

  router.get("/hashes", (_req, res) => {
    res.json(store.listHashes());
  });

  router.get("/tree", (req, res) => {
    const tree = store.listTree();
    const etag = formatTreeListingEtag(tree);
    if (ifNoneMatchAllowsTree(req, etag)) {
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, no-cache");
      return res.status(304).end();
    }
    logFilesOperation("[DEBUG] list-tree | response", {
      folders: tree.folders.length,
      files: tree.files.length,
      mappingRoots: tree.folders.filter((folder) => folder.is_mapping_root)
        .length,
      pendingFiles: tree.files.filter((file) => file.scan_pending).length,
      corruptFiles: tree.files.filter((file) => file.corrupt).length,
      withThumbnail: tree.files.filter((file) => file.has_thumbnail).length,
      scanState: tree.scan?.state ?? null,
      scanPass: tree.scan?.pass ?? null,
      scanRunning: tree.scan?.running ?? null,
      etag,
    });
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, no-cache");
    return res.json(tree);
  });

  router.post("/folders", (req, res) => {
    const result = runStore(res, () =>
      store.createFolder({
        name: req.body.name,
        parent_id: req.body.parent_id,
      }),
    );
    if (!result) {
      return undefined;
    }
    return res.status(201).json(result);
  });

  router.patch("/folders/:id", (req, res) => {
    const result = runStore(res, () =>
      store.renameFolder(req.params.id, req.body),
    );
    if (!result) {
      return undefined;
    }
    return res.json(result);
  });

  router.post("/folders/:id/open-local", async (req, res) => {
    let targetPath;
    try {
      targetPath = store.getLocalFolderPath(req.params.id);
    } catch (error) {
      return sendStoreError(res, error);
    }
    if (typeof openLocalPath !== "function") {
      return res.status(501).json({ error: "open local folder not available" });
    }
    try {
      const result = await openLocalPath(targetPath);
      if (typeof result === "string" && result) {
        return res.status(500).json({ error: result });
      }
      return res.json({ ok: true });
    } catch (error) {
      return sendStoreError(res, error);
    }
  });

  router.delete("/folders/:id", (req, res) => {
    const result = runStore(res, () => store.deleteFolder(req.params.id));
    if (!result) {
      return undefined;
    }
    filesystemWatcher.syncRoots();
    return res.json(result);
  });

  router.post("/move", (req, res) => {
    const fileIds = Array.isArray(req.body.file_ids)
      ? req.body.file_ids.filter((id) => typeof id === "string")
      : [];
    const result = runStore(res, () =>
      store.moveFiles(fileIds, req.body.folder_id),
    );
    if (!result) {
      return undefined;
    }
    return res.json(result);
  });

  router.post("/order", (req, res) => {
    const result = runStore(res, () =>
      store.saveOrder(req.body.parent_id, req.body.items),
    );
    if (!result) {
      return undefined;
    }
    return res.json(result);
  });

  router.get("/", (_req, res) => {
    res.json(store.listFiles());
  });

  router.post("/", (req, res) => {
    const result = runStore(res, () =>
      store.createFile({
        name: req.body.name,
        folder_id: req.body.folder_id,
        kind: req.body.kind,
      }),
    );
    if (!result) {
      return undefined;
    }
    return res.status(201).json(result);
  });

  router.post("/:id/import", (req, res) => {
    const result = runStore(res, () => store.importFile(req.params.id));
    if (!result) {
      return undefined;
    }
    return res.json(result);
  });

  router.post("/:id/open-local", (req, res) => {
    let targetPath;
    try {
      targetPath = store.getLocalFilePath(req.params.id);
    } catch (error) {
      return sendStoreError(res, error);
    }
    if (typeof showLocalItemInFolder !== "function") {
      return res.status(501).json({ error: "open local file not available" });
    }
    try {
      showLocalItemInFolder(targetPath);
      logFilesOperation("open-local-file", {
        id: `${String(req.params.id).slice(0, 8)}…`,
        path: targetPath,
      });
      return res.json({ ok: true });
    } catch (error) {
      return sendStoreError(res, error);
    }
  });

  router.get("/:id", (req, res) => {
    let payload;
    try {
      payload = store.getFile(req.params.id, req.get("if-none-match") ?? "");
    } catch (error) {
      return sendStoreError(res, error);
    }
    if (payload.notModified) {
      logGetFile(req.params.id, {
        outcome: "not-modified",
        sha: payload.content_sha256?.slice(0, 8),
      });
      return sendNotModified(res, payload.content_sha256);
    }
    const { file } = payload;
    const etag = formatDocumentEtag(file.content_sha256);
    if (etag) {
      res.setHeader("ETag", etag);
    }
    res.setHeader("Cache-Control", "private, no-cache");
    logGetFile(req.params.id, {
      outcome: "ok",
      kind: file.kind,
      sha: file.content_sha256?.slice(0, 8),
      name: file.name,
      origin: file.origin,
    });
    return res.json(file);
  });

  router.put("/:id", (req, res) => {
    let result;
    try {
      result = store.saveFile(req.params.id, req.body, {
        ifMatch: req.get("if-match") ?? "",
      });
    } catch (error) {
      logPutFile(req.params.id, req.body, {
        outcome: "error",
        source: req.query?.source ? String(req.query.source) : "",
        message: error instanceof Error ? error.message : String(error),
      });
      return sendStoreError(res, error);
    }
    logPutFile(req.params.id, req.body, {
      outcome: result.skipped ? "skipped" : "saved",
      source: req.query?.source ? String(req.query.source) : "",
      sha: result.content_sha256?.slice(0, 8),
      updated_at: result.updated_at,
    });
    return res.json(result);
  });

  router.get("/:id/thumbnail", (req, res) => {
    let svg;
    try {
      svg = store.getThumbnail(req.params.id);
    } catch (error) {
      return sendStoreError(res, error);
    }
    if (!svg) {
      return res.status(404).json({ error: "no thumbnail" });
    }
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader(
      "Cache-Control",
      req.query.h
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    );
    return res.send(svg);
  });

  router.patch("/:id", (req, res) => {
    const result = runStore(res, () =>
      store.renameFile(req.params.id, req.body.name),
    );
    if (!result) {
      return undefined;
    }
    return res.json(result);
  });

  router.delete("/:id", (req, res) => {
    const result = runStore(res, () => store.deleteFile(req.params.id));
    if (!result) {
      return undefined;
    }
    return res.json(result);
  });

  router.post("/:id/archive", (_req, res) => {
    return res
      .status(404)
      .json({ error: "archives disabled in folder mapping mode" });
  });

  router.get("/:id/archives", (_req, res) => {
    return res.json([]);
  });

  router.patch("/:id/archives/:archiveId", (_req, res) => {
    return res
      .status(404)
      .json({ error: "archives disabled in folder mapping mode" });
  });

  router.get("/:id/archives/:archiveId", (_req, res) => {
    return res
      .status(404)
      .json({ error: "archives disabled in folder mapping mode" });
  });

  router.post("/:id/restore/:archiveId", (_req, res) => {
    return res
      .status(404)
      .json({ error: "archives disabled in folder mapping mode" });
  });

  router.delete("/:id/archives/:archiveId", (_req, res) => {
    return res
      .status(404)
      .json({ error: "archives disabled in folder mapping mode" });
  });

  router.catalogWatcher = filesystemWatcher;
  return router;
}
