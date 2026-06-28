import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeDesktopAiConfig } from "./desktopAiConfigStore.js";
import { resolveDesktopDataFile } from "./desktopDataDir.js";
import { createDesktopLibraryRouter } from "./libraryRouter.js";
import { createDesktopTtdChatsRouter } from "./ttdChatsRouter.js";

function createTempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "editorhub-data-persist-"));
}

describe("desktop data persistence", () => {
  /** @type {string[]} */
  const tempDirs = [];
  /** @type {string | undefined} */
  let previousDataDir;

  beforeEach(() => {
    previousDataDir = process.env.EXCALIDRAW_DATA_DIR;
  });

  afterEach(() => {
    if (previousDataDir === undefined) {
      delete process.env.EXCALIDRAW_DATA_DIR;
    } else {
      process.env.EXCALIDRAW_DATA_DIR = previousDataDir;
    }
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("writes AI config into EXCALIDRAW_DATA_DIR", async () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    process.env.EXCALIDRAW_DATA_DIR = dataDir;

    await writeDesktopAiConfig({
      excalidraw: { endpoint: "https://api.test/v1", apiKey: "sk-test" },
      mindmap: { endpoint: "https://api.test/v1", apiKey: "sk-mm" },
    });

    const filePath = resolveDesktopDataFile("ai-settings.json");
    expect(path.normalize(filePath)).toBe(
      path.normalize(path.join(dataDir, "ai-settings.json")),
    );
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(parsed.excalidraw.apiKey).toBe("sk-test");
  });

  it("writes library sync payload into library-store.json", async () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    process.env.EXCALIDRAW_DATA_DIR = dataDir;

    const router = createDesktopLibraryRouter();
    const handler = router.stack.find(
      (layer) => layer.route?.path === "/sync" && layer.route?.methods?.post,
    )?.route?.stack?.[0]?.handle;
    expect(handler).toBeTypeOf("function");

    const res = {
      statusCode: 200,
      body: null,
      json(payload) {
        this.body = payload;
        return payload;
      },
    };
    await handler(
      {
        body: {
          publicItems: [
            {
              id: "lib-1",
              name: "shape",
              data: [{ type: "rectangle" }],
            },
          ],
          personalItems: [],
          groups: [],
        },
      },
      res,
    );

    const storePath = resolveDesktopDataFile("library-store.json");
    expect(fs.existsSync(storePath)).toBe(true);
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    expect(store.items.some((item) => item.id === "lib-1")).toBe(true);
    expect(res.body).toEqual({ ok: true });
  });

  it("writes TTD chats into ttd-chats.json", async () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    process.env.EXCALIDRAW_DATA_DIR = dataDir;

    const router = createDesktopTtdChatsRouter();
    const handler = router.stack.find(
      (layer) => layer.route?.path === "/" && layer.route?.methods?.put,
    )?.route?.stack?.[0]?.handle;
    expect(handler).toBeTypeOf("function");

    const res = {
      statusCode: 200,
      body: null,
      json(payload) {
        this.body = payload;
        return payload;
      },
    };
    await handler(
      {
        body: [{ id: "chat-1", title: "Test", messages: [] }],
      },
      res,
    );

    const chatsPath = resolveDesktopDataFile("ttd-chats.json");
    expect(fs.existsSync(chatsPath)).toBe(true);
    const chats = JSON.parse(fs.readFileSync(chatsPath, "utf8"));
    expect(chats[0].id).toBe("chat-1");
    expect(res.body).toEqual({ ok: true });
  });
});
