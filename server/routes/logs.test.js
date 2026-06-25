import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _transports } from "../lib/logger.js";

import { createLogsRouter } from "./logs.js";

function createTestServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/logs", createLogsRouter());
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}/api/logs`,
      });
    });
  });
}

describe("logs route debug ingest", () => {
  let captured;
  let transport;
  let previousDebugEnabled;
  let previousDeployDebug;

  beforeEach(() => {
    captured = [];
    transport = { write: (entry) => captured.push(entry) };
    _transports.push(transport);
    previousDebugEnabled = process.env.EDITORHUB_DEBUG_ENABLED;
    previousDeployDebug = process.env.DEPLOY_DEBUG;
    process.env.EDITORHUB_DEBUG_ENABLED = "1";
    delete process.env.DEPLOY_DEBUG;
  });

  afterEach(() => {
    const index = _transports.indexOf(transport);
    if (index >= 0) {
      _transports.splice(index, 1);
    }
    if (previousDebugEnabled === undefined) {
      delete process.env.EDITORHUB_DEBUG_ENABLED;
    } else {
      process.env.EDITORHUB_DEBUG_ENABLED = previousDebugEnabled;
    }
    if (previousDeployDebug === undefined) {
      delete process.env.DEPLOY_DEBUG;
    } else {
      process.env.DEPLOY_DEBUG = previousDeployDebug;
    }
  });

  it("drops batches unless debug mode is explicitly enabled by server and client", async () => {
    const { server, baseUrl } = await createTestServer();
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [{ level: "info", module: "ui", msg: "hidden" }],
        }),
      });

      expect(res.status).toBe(204);
      expect(captured).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("ingests structured debug entries when runtime debug is allowed", async () => {
    const { server, baseUrl } = await createTestServer();
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debugMode: true,
          entries: [
            {
              ts: "2026-06-19T18:00:00.000Z",
              level: "info",
              component: "FE",
              module: "save",
              event: "doc.version.save",
              msg: "saved",
              context: { run: "run-1", secretToken: "hidden" },
              fields: { fileId8: "abcd1234", version: 2 },
              data: { fallback: true },
              sourceLocation: "EditorShell.tsx:10",
            },
          ],
        }),
      });

      expect(res.status).toBe(204);
      expect(captured).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "client",
            component: "FE",
            module: "save",
            event: "doc.version.save",
            msg: "saved",
            context: { run: "run-1", secretToken: "[redacted]" },
            fields: {
              fallback: true,
              fileId8: "abcd1234",
              version: 2,
              debugMode: true,
            },
            sourceLocation: "EditorShell.tsx:10",
          }),
        ]),
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
