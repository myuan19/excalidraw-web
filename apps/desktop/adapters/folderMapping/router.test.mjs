import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

import express from "express";
import { describe, expect, it } from "vitest";

import {
  createFolderMappingRouter,
  createOwnWritePathSuppressor,
} from "./router.js";
import { summarizePutBody } from "./desktopFilesLog.mjs";

function createTestServer(router) {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/files", router);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}/api/files`,
      });
    });
  });
}

async function jsonFetch(url, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    response,
    data: text ? JSON.parse(text) : null,
  };
}

async function waitForCatalogScan(baseUrl, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await jsonFetch(`${baseUrl}/scan-status`);
    if (status.data?.state === "idle" && !status.data?.running) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("catalog scan timed out");
}

async function mountMappingRoot(baseUrl, absPath) {
  const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
    method: "POST",
    body: JSON.stringify({ absPath }),
  });
  expect(mapped.response.status).toBe(201);
  await waitForCatalogScan(baseUrl);
  return mapped.data.folder;
}

describe("desktop folder mapping router", () => {
  it("suppresses watcher rescans for recent app-owned file writes", () => {
    let now = 1000;
    const suppressor = createOwnWritePathSuppressor({
      ttlMs: 500,
      now: () => now,
    });
    const root = path.join(os.tmpdir(), "editorhub-own-write-root");
    const filePath = path.join(root, "docs", "demo.excalidraw");

    suppressor.mark(filePath);

    expect(suppressor.shouldSuppress(root, "docs/demo.excalidraw")).toBe(true);
    expect(suppressor.shouldSuppress(root, "docs\\demo.excalidraw")).toBe(true);

    now += 501;

    expect(suppressor.shouldSuppress(root, "docs/demo.excalidraw")).toBe(false);
  });

  it("summarizes MindMap PUT payloads for desktop diagnostics", () => {
    const summary = summarizePutBody({
      name: "Map",
      data: {
        kind: "mindmap",
        data: {
          root: {
            data: { text: "<p>Root</p>", richText: true },
            children: [
              { data: { text: "<p>Child</p>", richText: true }, children: [] },
            ],
          },
        },
      },
      thumbnail: "<svg />",
      checkpointPolicy: { mode: "interval" },
    });

    expect(summary).toMatchObject({
      hasData: true,
      kind: "mindmap",
      checkpointPolicyMode: "interval",
      mindMap: {
        nodeCount: 2,
        rootText: "Root",
        rootChildCount: 1,
        flatNodes: [
          { path: "root", text: "Root", childCount: 1 },
          { path: "root.0", text: "Child", childCount: 0 },
        ],
      },
    });
  });

  it("returns the existing mapping root when adding a duplicate path", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-map-dup-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const first = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      expect(first.response.status).toBe(201);
      expect(first.data.folder?.id).toBeTruthy();

      const second = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      expect(second.response.status).toBe(201);
      expect(second.data.folder?.id).toBe(first.data.folder.id);
      expect(second.data.mappingRoot?.absPath).toBe(
        first.data.mappingRoot?.absPath,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not duplicate known file extensions when creating documents", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-create-ext-"),
    );
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const created = await jsonFetch(`${baseUrl}/`, {
        method: "POST",
        body: JSON.stringify({
          name: "map.smm",
          kind: "mindmap",
          folder_id: rootFolder.id,
        }),
      });

      expect(created.response.status).toBe(201);
      expect(created.data.name).toBe("map");
      expect(existsSync(path.join(docsDir, "map.smm"))).toBe(true);
      expect(existsSync(path.join(docsDir, "map.smm.smm"))).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("rejects folder rename conflicts instead of auto-renaming", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-folder-conflict-"),
    );
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const alpha = await jsonFetch(`${baseUrl}/folders`, {
        method: "POST",
        body: JSON.stringify({ name: "Alpha", parent_id: rootFolder.id }),
      });
      const beta = await jsonFetch(`${baseUrl}/folders`, {
        method: "POST",
        body: JSON.stringify({ name: "Beta", parent_id: rootFolder.id }),
      });

      const renamed = await jsonFetch(`${baseUrl}/folders/${beta.data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: alpha.data.name }),
      });

      expect(renamed.response.status).toBe(409);
      expect(existsSync(path.join(docsDir, "Alpha"))).toBe(true);
      expect(existsSync(path.join(docsDir, "Beta"))).toBe(true);
      expect(existsSync(path.join(docsDir, "Alpha (1)"))).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps the /api/files shape over a local workspace", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const capabilities = await jsonFetch(`${baseUrl}/capabilities`);
      expect(capabilities.data).toMatchObject({
        folderMapping: true,
        addMappedFolder: true,
        archivesEnabled: false,
      });

      const created = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Sketch",
          kind: "excalidraw",
          folder_id: rootFolder.id,
        }),
      });
      expect(created.response.status).toBe(201);
      expect(created.data).toMatchObject({
        name: "Sketch",
        kind: "excalidraw",
        folder_id: rootFolder.id,
        origin: "managed",
        version: 0,
      });

      const saved = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Sketch",
          data: { elements: [], appState: { name: "Sketch" }, files: {} },
          expectedVersion: created.data.version,
          thumbnail: '<svg viewBox="0 0 1 1" />',
          archiveLabel: "manual",
        }),
      });
      expect(saved.data.content_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(saved.data.version).toBe(1);

      const loaded = await jsonFetch(`${baseUrl}/${created.data.id}`);
      expect(loaded.data).toMatchObject({
        id: created.data.id,
        name: "Sketch",
        has_thumbnail: true,
        origin: "managed",
        version: 1,
        data: { appState: { name: "Sketch" } },
      });
      expect(loaded.response.headers.get("etag")).toBe(
        `"${saved.data.content_sha256}"`,
      );

      const notModified = await fetch(`${baseUrl}/${created.data.id}`, {
        headers: { "If-None-Match": `"${saved.data.content_sha256}"` },
      });
      expect(notModified.status).toBe(304);

      const tree = await jsonFetch(`${baseUrl}/tree`);
      expect(tree.data.files).toHaveLength(1);
      expect(tree.data.files[0].version).toBe(1);
      expect(tree.data.capabilities.addMappedFolder).toBe(true);

      const hashes = await jsonFetch(`${baseUrl}/hashes`);
      expect(hashes.data).toEqual([
        {
          id: created.data.id,
          content_sha256: saved.data.content_sha256,
          version: 1,
        },
      ]);

      const thumbnail = await fetch(`${baseUrl}/${created.data.id}/thumbnail`);
      expect(thumbnail.status).toBe(200);
      expect(await thumbnail.text()).toContain("<svg");

      const archives = await jsonFetch(
        `${baseUrl}/${created.data.id}/archives`,
      );
      expect(archives.data).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("rejects stale expectedVersion with 409 before overwriting newer content", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-ifmatch-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const created = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Sketch",
          kind: "excalidraw",
          folder_id: rootFolder.id,
        }),
      });
      expect(created.response.status).toBe(201);

      const initialData = {
        elements: [],
        appState: { name: "Sketch" },
        files: {},
      };
      const firstSave = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Sketch",
          data: initialData,
          expectedVersion: created.data.version,
        }),
      });
      expect(firstSave.response.status).toBe(200);
      const firstSha = firstSave.data.content_sha256;
      expect(firstSave.data.version).toBe(1);

      const secondSave = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        headers: { "If-Match": `"${firstSha}"` },
        body: JSON.stringify({
          name: "Sketch",
          data: {
            elements: [{ id: "a", type: "rectangle" }],
            appState: { name: "Sketch" },
            files: {},
          },
          expectedVersion: firstSave.data.version,
        }),
      });
      expect(secondSave.response.status).toBe(200);
      const secondSha = secondSave.data.content_sha256;
      expect(secondSha).not.toBe(firstSha);
      expect(secondSave.data.version).toBe(2);

      const staleSave = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        headers: { "If-Match": `"${firstSha}"` },
        body: JSON.stringify({
          name: "Sketch",
          data: initialData,
          expectedVersion: firstSave.data.version,
        }),
      });
      expect(staleSave.response.status).toBe(409);
      expect(staleSave.data).toMatchObject({
        error: "version_conflict",
        version: 2,
        content_sha256: secondSha,
      });

      const loaded = await jsonFetch(`${baseUrl}/${created.data.id}`);
      expect(loaded.data.content_sha256).toBe(secondSha);
      expect(loaded.data.version).toBe(2);

      const overwritten = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        headers: { "If-Match": `"${firstSha}"` },
        body: JSON.stringify({
          name: "Sketch",
          data: initialData,
          expectedVersion: firstSave.data.version,
          forceOverwrite: true,
        }),
      });
      expect(overwritten.response.status).toBe(200);
      expect(overwritten.data.version).toBe(3);
      expect(overwritten.data.content_sha256).toBe(firstSha);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("advances version when a managed file changes on disk outside the adapter", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-external-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const created = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Sketch",
          kind: "excalidraw",
          folder_id: rootFolder.id,
        }),
      });
      const saved = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Sketch",
          data: { elements: [], appState: { name: "Sketch" }, files: {} },
          expectedVersion: created.data.version,
        }),
      });
      expect(saved.data.version).toBe(1);

      writeFileSync(
        path.join(docsDir, "Sketch.excalidraw"),
        JSON.stringify({
          elements: [{ id: "external", type: "rectangle" }],
          appState: { name: "Sketch" },
          files: {},
        }),
        "utf-8",
      );

      const loaded = await jsonFetch(`${baseUrl}/${created.data.id}`);
      expect(loaded.data.version).toBe(2);
      expect(loaded.data.content_sha256).not.toBe(saved.data.content_sha256);

      const staleSave = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Sketch",
          data: { elements: [], appState: { name: "Sketch" }, files: {} },
          expectedVersion: saved.data.version,
        }),
      });
      expect(staleSave.response.status).toBe(409);
      expect(staleSave.data.version).toBe(2);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("deduplicates creates but rejects duplicate renames", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-dedupe-"),
    );
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const first = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Project",
          kind: "mindmap",
          folder_id: rootFolder.id,
        }),
      });
      const second = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Project",
          kind: "mindmap",
          folder_id: rootFolder.id,
        }),
      });
      expect(first.response.status).toBe(201);
      expect(second.response.status).toBe(201);
      expect(first.data.name).toBe("Project");
      expect(second.data.name).toBe("Project (1)");
      expect(existsSync(path.join(docsDir, "Project.smm"))).toBe(true);
      expect(existsSync(path.join(docsDir, "Project (1).smm"))).toBe(true);

      const renamed = await jsonFetch(`${baseUrl}/${second.data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Project" }),
      });
      expect(renamed.response.status).toBe(409);
      expect(renamed.data).toMatchObject({
        error: "file_name_conflict",
        message: "文件名已存在",
      });
      expect(existsSync(path.join(docsDir, "Project (1).smm"))).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("discovers mindmap files from a mapped folder root", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-map-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    writeFileSync(
      path.join(mappedDir, "demo.smm"),
      JSON.stringify({
        root: { data: { text: "Demo" }, children: [] },
        layout: "logicalStructure",
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      expect(mapped.response.status).toBe(201);
      await waitForCatalogScan(baseUrl);
      const tree = await jsonFetch(`${baseUrl}/tree`);
      expect(tree.data.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "demo",
            kind: "mindmap",
            origin: "managed",
            importable: false,
          }),
        ]),
      );

      const fileId = tree.data.files.find((file) => file.name === "demo")?.id;
      const loaded = await jsonFetch(`${baseUrl}/${fileId}`);
      expect(loaded.data.origin).toBe("managed");
      expect(loaded.data.importable).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("only discovers supported knowledge file suffixes in mapped folders", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-map-filter-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(path.join(mappedDir, "nested"), { recursive: true });
    writeFileSync(
      path.join(mappedDir, "notes.json"),
      JSON.stringify({ title: "plain json should not be cataloged" }),
      "utf-8",
    );
    writeFileSync(
      path.join(mappedDir, "canvas.excalidraw.json"),
      JSON.stringify({
        type: "excalidraw",
        elements: [],
        appState: {},
        files: {},
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(mappedDir, "nested", "map.mindmap.json"),
      JSON.stringify({
        root: { data: { text: "Nested Map" }, children: [] },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });

      const tree = await jsonFetch(`${baseUrl}/tree`);
      expect(tree.data.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "canvas",
            kind: "excalidraw",
          }),
          expect.objectContaining({
            name: "map",
            kind: "mindmap",
          }),
        ]),
      );
      expect(tree.data.files).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "notes" })]),
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps created files in external mapped folders addressable by id", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-workspace-"),
    );
    const mappedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-external-map-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      expect(mapped.response.status).toBe(201);
      const folderId = mapped.data.folder.id;

      const created = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Mapped MindMap",
          kind: "mindmap",
          folder_id: folderId,
        }),
      });
      expect(created.response.status).toBe(201);
      expect(created.data.origin).toBe("managed");

      const saved = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Mapped MindMap",
          data: {
            root: { data: { text: "Mapped" }, children: [] },
            layout: "logicalStructure",
          },
          expectedVersion: created.data.version,
          thumbnail: '<svg data-test-thumb="1" />',
        }),
      });
      expect(saved.response.status).toBe(200);

      const loaded = await jsonFetch(`${baseUrl}/${created.data.id}`);
      expect(loaded.response.status).toBe(200);
      expect(loaded.data.origin).toBe("managed");
      expect(loaded.data.importable).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(mappedDir, { recursive: true, force: true });
    }
  });

  it("removes mapped folder roots without deleting the local directory", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-workspace-"),
    );
    const mappedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-remove-map-"),
    );
    writeFileSync(
      path.join(mappedDir, "kept.smm"),
      JSON.stringify({
        root: { data: { text: "Kept" }, children: [] },
        layout: "logicalStructure",
      }),
      "utf-8",
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      const folderId = mapped.data.folder.id;

      const removed = await jsonFetch(`${baseUrl}/folders/${folderId}`, {
        method: "DELETE",
      });
      expect(removed.response.status).toBe(200);
      expect(removed.data).toMatchObject({
        ok: true,
        removed_mapping_root: true,
      });
      expect(existsSync(mappedDir)).toBe(true);
      expect(existsSync(path.join(mappedDir, "kept.smm"))).toBe(true);

      const tree = await jsonFetch(`${baseUrl}/tree`);
      expect(tree.data.folders).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: folderId })]),
      );
      expect(tree.data.files).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "kept" })]),
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(mappedDir, { recursive: true, force: true });
    }
  });

  it("ignores parent_folder_id when adding mapping roots", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-workspace-"),
    );
    const mappedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-map-sibling-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({
          absPath: mappedDir,
          parent_folder_id: "would-nest-if-honored",
        }),
      });
      expect(mapped.response.status).toBe(201);
      expect(mapped.data.folder.parent_id).toBeNull();

      const tree = await jsonFetch(`${baseUrl}/tree`);
      const mount = tree.data.folders.find(
        (folder) => folder.id === mapped.data.folder.id,
      );
      expect(mount?.parent_id).toBeNull();
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(mappedDir, { recursive: true, force: true });
    }
  });

  it("cancels background scan when a mapping root is removed", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-workspace-"),
    );
    const mappedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-cancel-scan-"),
    );
    mkdirSync(path.join(mappedDir, "deep"), { recursive: true });
    for (let index = 0; index < 120; index += 1) {
      writeFileSync(
        path.join(mappedDir, "deep", `file-${index}.smm`),
        JSON.stringify({
          root: { data: { text: `Node ${index}` }, children: [] },
          layout: "logicalStructure",
        }),
        "utf-8",
      );
    }
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      expect(mapped.response.status).toBe(201);
      const folderId = mapped.data.folder.id;

      const removed = await jsonFetch(`${baseUrl}/folders/${folderId}`, {
        method: "DELETE",
      });
      expect(removed.response.status).toBe(200);
      expect(removed.data.scan?.state).toBe("idle");
      expect(removed.data.scan?.running).toBe(false);

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const status = await jsonFetch(`${baseUrl}/scan-status`);
        if (status.data?.state === "idle" && !status.data?.running) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }

      const tree = await jsonFetch(`${baseUrl}/tree`);
      expect(tree.data.folders).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: folderId })]),
      );
      expect(tree.data.files).toHaveLength(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(mappedDir, { recursive: true, force: true });
    }
  });

  it("renames mapped folder roots as labels without renaming the local directory", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-workspace-"),
    );
    const mappedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-label-map-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      const folderId = mapped.data.folder.id;
      const renamed = await jsonFetch(`${baseUrl}/folders/${folderId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Custom Label" }),
      });

      expect(renamed.response.status).toBe(200);
      expect(renamed.data).toMatchObject({
        id: folderId,
        name: "Custom Label",
        is_mapping_root: true,
      });
      expect(existsSync(mappedDir)).toBe(true);
      expect(
        existsSync(path.join(path.dirname(mappedDir), "Custom Label")),
      ).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(mappedDir, { recursive: true, force: true });
    }
  });

  it("opens local files through showItemInFolder", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-open-file-"),
    );
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });
    const revealed = [];
    const router = await createFolderMappingRouter({
      workspacePath,
      showLocalItemInFolder: (targetPath) => {
        revealed.push(targetPath);
      },
    });
    const { server, baseUrl } = await createTestServer(router);
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const created = await jsonFetch(`${baseUrl}/`, {
        method: "POST",
        body: JSON.stringify({
          name: "note",
          kind: "excalidraw",
          folder_id: rootFolder.id,
        }),
      });
      const fileId = created.data.id;
      const result = await jsonFetch(`${baseUrl}/${fileId}/open-local`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      expect(result.response.status).toBe(200);
      expect(result.data).toEqual({ ok: true });
      expect(revealed).toHaveLength(1);
      expect(revealed[0]).toContain("note");
      expect(revealed[0]).toMatch(/\.excalidraw$/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("opens local folders through a validated desktop callback", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-workspace-"),
    );
    const mappedDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-open-map-"),
    );
    const opened = [];
    const router = await createFolderMappingRouter({
      workspacePath,
      openLocalPath: async (targetPath) => {
        opened.push(targetPath);
        return "";
      },
    });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const mapped = await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });
      const folderId = mapped.data.folder.id;
      const result = await jsonFetch(
        `${baseUrl}/folders/${folderId}/open-local`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      expect(result.response.status).toBe(200);
      expect(result.data).toEqual({ ok: true });
      expect(opened).toEqual([path.resolve(mappedDir)]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(mappedDir, { recursive: true, force: true });
    }
  });

  it("allows saving mapped mindmap files without a separate import step", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-repair-"),
    );
    const documentsDir = path.join(workspacePath, "documents");
    mkdirSync(documentsDir, { recursive: true });
    writeFileSync(
      path.join(documentsDir, "broken.smm"),
      JSON.stringify({
        root: { data: { text: "Broken" }, children: [] },
        layout: "logicalStructure",
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    await mountMappingRoot(baseUrl, documentsDir);

    try {
      const tree = await jsonFetch(`${baseUrl}/tree`);
      const broken = tree.data.files.find((file) => file.name === "broken");
      expect(broken?.origin).toBe("managed");
      expect(broken?.importable).toBe(false);

      const saved = await jsonFetch(`${baseUrl}/${broken.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "broken",
          data: {
            root: { data: { text: "Fixed" }, children: [] },
            layout: "logicalStructure",
          },
          expectedVersion: broken.version,
        }),
      });
      expect(saved.response.status).toBe(200);

      const loaded = await jsonFetch(`${baseUrl}/${broken.id}`);
      expect(loaded.data.origin).toBe("managed");
      expect(loaded.data.importable).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("marks invalid mapped files as corrupt without thumbnails", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-corrupt-"),
    );
    const mappedDir = path.join(workspacePath, "mapped");
    mkdirSync(mappedDir, { recursive: true });
    writeFileSync(path.join(mappedDir, "broken.smm"), "{not-json", "utf-8");
    writeFileSync(
      path.join(mappedDir, "valid.smm"),
      JSON.stringify({
        root: { data: { text: "Valid" }, children: [] },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      await jsonFetch(`${baseUrl}/mapping-roots`, {
        method: "POST",
        body: JSON.stringify({ absPath: mappedDir }),
      });

      const tree = await jsonFetch(`${baseUrl}/tree`);
      const broken = tree.data.files.find((file) => file.name === "broken");
      const valid = tree.data.files.find((file) => file.name === "valid");
      expect(broken).toMatchObject({
        health: "corrupt",
        corrupt: true,
        has_thumbnail: false,
      });
      expect(valid).toMatchObject({
        health: "ok",
        has_thumbnail: true,
      });

      const brokenThumb = await fetch(`${baseUrl}/${broken.id}/thumbnail`);
      expect(brokenThumb.status).toBe(404);

      const validThumb = await fetch(`${baseUrl}/${valid.id}/thumbnail`);
      expect(validThumb.status).toBe(200);
      expect(await validThumb.text()).toContain("<svg");

      const brokenLoad = await jsonFetch(`${baseUrl}/${broken.id}`);
      expect(brokenLoad.data).toMatchObject({
        corrupt: true,
        data: null,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("resolves catalog files by absolute path for desktop drag-open", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-resolve-path-"),
    );
    const docsDir = path.join(workspacePath, "docs");
    mkdirSync(docsDir, { recursive: true });

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);
    const rootFolder = await mountMappingRoot(baseUrl, docsDir);

    try {
      const created = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          name: "Sketch",
          kind: "excalidraw",
          folder_id: rootFolder.id,
        }),
      });
      expect(created.response.status).toBe(201);
      const sketchPath = path.join(docsDir, "Sketch.excalidraw");

      const resolved = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({
          absPath: sketchPath,
        }),
      });
      expect(resolved.response.status).toBe(200);
      expect(resolved.data.file.name).toBe("Sketch");
      expect(resolved.data.file.origin).toBe("managed");

      const missing = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({
          absPath: path.join(docsDir, "missing.excalidraw"),
        }),
      });
      expect(missing.response.status).toBe(404);
      expect(missing.data.code).toBe("file_not_found");

      writeFileSync(path.join(docsDir, "notes.txt"), "hello", "utf-8");
      const unsupported = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({
          absPath: path.join(docsDir, "notes.txt"),
        }),
      });
      expect(unsupported.response.status).toBe(400);
      expect(unsupported.data.code).toBe("unsupported_format");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("tracks external files without copying them into the workspace tree", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-track-path-"),
    );
    const externalDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-track-external-"),
    );
    const externalPath = path.join(externalDir, "Outside.smm");
    writeFileSync(
      externalPath,
      JSON.stringify({
        root: {
          data: { text: "Outside" },
          children: [],
        },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const tracked = await jsonFetch(`${baseUrl}/track-path`, {
        method: "POST",
        body: JSON.stringify({
          absPath: externalPath,
        }),
      });
      expect(tracked.response.status).toBe(200);
      expect(tracked.data.tracked).toBe(true);
      expect(tracked.data.file.name).toBe("Outside");
      expect(tracked.data.file.origin).toBe("external");
      expect(tracked.data.file.has_thumbnail).toBe(false);
      expect(existsSync(path.join(workspacePath, "Outside.smm"))).toBe(false);

      const trackedThumb = await fetch(
        `${baseUrl}/${tracked.data.file.id}/thumbnail`,
      );
      expect(trackedThumb.status).toBe(404);

      const resolved = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({
          absPath: externalPath,
        }),
      });
      expect(resolved.response.status).toBe(200);
      expect(resolved.data.file.id).toBe(tracked.data.file.id);
      expect(resolved.data.file.has_thumbnail).toBe(false);

      const tree = await jsonFetch(`${baseUrl}/tree`);
      expect(tree.response.status).toBe(200);
      expect(tree.data.files.map((file) => file.id)).not.toContain(
        tracked.data.file.id,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("untracks external files without deleting the original path", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-untrack-path-"),
    );
    const externalDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-untrack-external-"),
    );
    const externalPath = path.join(externalDir, "Outside.smm");
    writeFileSync(
      externalPath,
      JSON.stringify({
        root: { data: { text: "Outside" }, children: [] },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const tracked = await jsonFetch(`${baseUrl}/track-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: externalPath }),
      });
      expect(tracked.response.status).toBe(200);

      const deleted = await fetch(`${baseUrl}/${tracked.data.file.id}`, {
        method: "DELETE",
      });
      expect(deleted.status).toBe(200);
      expect(existsSync(externalPath)).toBe(true);

      const resolved = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: externalPath }),
      });
      expect(resolved.response.status).toBe(404);
      expect(resolved.data.code).toBe("not_in_catalog");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("renames external tracked files in their original directory", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-rename-external-workspace-"),
    );
    const externalDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-rename-external-src-"),
    );
    const externalPath = path.join(externalDir, "Outside.smm");
    writeFileSync(
      externalPath,
      JSON.stringify({
        root: { data: { text: "Outside" }, children: [] },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const tracked = await jsonFetch(`${baseUrl}/track-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: externalPath }),
      });
      expect(tracked.response.status).toBe(200);

      const renamed = await jsonFetch(`${baseUrl}/${tracked.data.file.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      });
      expect(renamed.response.status).toBe(200);
      expect(renamed.data).toMatchObject({
        name: "Renamed",
        origin: "external",
      });

      const renamedPath = path.join(externalDir, "Renamed.smm");
      expect(existsSync(externalPath)).toBe(false);
      expect(existsSync(renamedPath)).toBe(true);
      expect(existsSync(path.join(workspacePath, "Renamed.smm"))).toBe(false);

      const resolved = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: renamedPath }),
      });
      expect(resolved.response.status).toBe(200);
      expect(resolved.data.file.id).toBe(tracked.data.file.id);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("returns the current content hash after thumbnail-only saves", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-thumbnail-only-"),
    );
    const externalDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-thumbnail-only-external-"),
    );
    const externalPath = path.join(externalDir, "Outside.smm");
    writeFileSync(
      externalPath,
      JSON.stringify({
        root: { data: { text: "Outside" }, children: [] },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const tracked = await jsonFetch(`${baseUrl}/track-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: externalPath }),
      });
      expect(tracked.response.status).toBe(200);
      expect(tracked.data.file.has_thumbnail).toBe(false);

      const savedThumb = await jsonFetch(`${baseUrl}/${tracked.data.file.id}`, {
        method: "PUT",
        body: JSON.stringify({
          thumbnail: '<svg data-excal-thumb-source="mindmap-native" />',
        }),
      });
      expect(savedThumb.response.status).toBe(200);
      expect(savedThumb.data.content_sha256).toBe(
        tracked.data.file.content_sha256,
      );
      expect(savedThumb.data.updated_at).toBeTruthy();

      const resolved = await jsonFetch(`${baseUrl}/resolve-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: externalPath }),
      });
      expect(resolved.response.status).toBe(200);
      expect(resolved.data.file.has_thumbnail).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("accepts async thumbnail uploads on PUT /:id/thumbnail", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-async-thumb-"),
    );
    const externalDir = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-async-thumb-external-"),
    );
    const externalPath = path.join(externalDir, "AsyncThumb.smm");
    writeFileSync(
      externalPath,
      JSON.stringify({
        root: { data: { text: "Async" }, children: [] },
      }),
      "utf-8",
    );

    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const tracked = await jsonFetch(`${baseUrl}/track-path`, {
        method: "POST",
        body: JSON.stringify({ absPath: externalPath }),
      });
      expect(tracked.response.status).toBe(200);
      const contentSha256 = tracked.data.file.content_sha256;
      expect(contentSha256).toBeTruthy();

      const uploaded = await jsonFetch(
        `${baseUrl}/${tracked.data.file.id}/thumbnail`,
        {
          method: "PUT",
          body: JSON.stringify({
            thumbnail: '<svg viewBox="0 0 1 1"><rect width="1" height="1" /></svg>',
            contentSha256,
          }),
        },
      );
      expect(uploaded.response.status).toBe(200);
      expect(uploaded.data.content_sha256).toBe(contentSha256);

      const fetched = await fetch(
        `${baseUrl}/${tracked.data.file.id}/thumbnail`,
      );
      expect(fetched.status).toBe(200);
      expect(await fetched.text()).toContain("<svg");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
      rmSync(externalDir, { recursive: true, force: true });
    }
  });
});
