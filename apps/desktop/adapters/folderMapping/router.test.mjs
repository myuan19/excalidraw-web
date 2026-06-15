import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

import express from "express";
import { describe, expect, it } from "vitest";

import { createFolderMappingRouter } from "./router.js";

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
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  return {
    response,
    data: text ? JSON.parse(text) : null,
  };
}

describe("desktop folder mapping router", () => {
  it("keeps the /api/files shape over a local workspace", async () => {
    const workspacePath = mkdtempSync(
      path.join(os.tmpdir(), "editorhub-desktop-"),
    );
    const router = await createFolderMappingRouter({ workspacePath });
    const { server, baseUrl } = await createTestServer(router);

    try {
      const created = await jsonFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({ name: "Sketch", kind: "excalidraw" }),
      });
      expect(created.response.status).toBe(201);
      expect(created.data).toMatchObject({
        name: "Sketch",
        kind: "excalidraw",
        folder_id: null,
      });

      const saved = await jsonFetch(`${baseUrl}/${created.data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Sketch",
          data: { elements: [], appState: { name: "Sketch" }, files: {} },
          thumbnail: '<svg viewBox="0 0 1 1" />',
          archiveLabel: "manual",
        }),
      });
      expect(saved.data.content_sha256).toMatch(/^[a-f0-9]{64}$/);

      const loaded = await jsonFetch(`${baseUrl}/${created.data.id}`);
      expect(loaded.data).toMatchObject({
        id: created.data.id,
        name: "Sketch",
        has_thumbnail: true,
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
      expect(tree.data.folders).toEqual([]);

      const thumbnail = await fetch(`${baseUrl}/${created.data.id}/thumbnail`);
      expect(thumbnail.status).toBe(200);
      expect(await thumbnail.text()).toContain("<svg");

      const archives = await jsonFetch(
        `${baseUrl}/${created.data.id}/archives`,
      );
      expect(archives.data).toHaveLength(1);
      expect(archives.data[0]).toMatchObject({ label: "manual" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });
});
