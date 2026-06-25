import express from "express";
import { describe, expect, it } from "vitest";

import { dispatchExpressRequest } from "./apiDispatcher.mjs";

describe("dispatchExpressRequest", () => {
  it("dispatches JSON GET without listening on a port", async () => {
    const app = express();
    app.get("/api/health", (_req, res) => {
      res.json({ ok: true });
    });

    const result = await dispatchExpressRequest(app, {
      method: "GET",
      path: "/api/health",
    });

    expect(result.status).toBe(200);
    expect(JSON.parse(result.bodyText)).toEqual({ ok: true });
  });

  it("preserves status and headers for 304 responses", async () => {
    const app = express();
    app.get("/api/files/tree", (req, res) => {
      const etag = req.headers["if-none-match"];
      if (etag === '"tree-etag"') {
        res.status(304);
        res.setHeader("ETag", '"tree-etag"');
        return res.end();
      }
      res.setHeader("ETag", '"tree-etag"');
      return res.json({ folders: [], files: [] });
    });

    const cached = await dispatchExpressRequest(app, {
      method: "GET",
      path: "/api/files/tree",
      headers: { "If-None-Match": '"tree-etag"' },
    });
    expect(cached.status).toBe(304);
    expect(cached.headers.etag).toBe('"tree-etag"');
    expect(cached.bodyText).toBe("");

    const full = await dispatchExpressRequest(app, {
      method: "GET",
      path: "/api/files/tree",
    });
    expect(full.status).toBe(200);
    expect(JSON.parse(full.bodyText)).toEqual({ folders: [], files: [] });
  });

  it("returns non-JSON body for SVG thumbnails", async () => {
    const app = express();
    app.get("/api/files/:id/thumbnail", (_req, res) => {
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.send("<svg data-test-thumb />");
    });

    const result = await dispatchExpressRequest(app, {
      method: "GET",
      path: "/api/files/file-1/thumbnail",
      headers: { Accept: "image/svg+xml" },
    });

    expect(result.status).toBe(200);
    expect(result.bodyText).toContain("<svg");
    expect(result.headers["content-type"]).toContain("image/svg+xml");
  });

  it("accepts POST JSON bodies", async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/files/folders", (req, res) => {
      res.status(201).json({ id: "folder-1", name: req.body.name });
    });

    const result = await dispatchExpressRequest(app, {
      method: "POST",
      path: "/api/files/folders",
      body: JSON.stringify({ name: "Notes" }),
    });

    expect(result.status).toBe(201);
    expect(JSON.parse(result.bodyText)).toEqual({ id: "folder-1", name: "Notes" });
  });
});
