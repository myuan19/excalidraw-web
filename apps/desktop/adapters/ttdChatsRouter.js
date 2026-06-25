import fs from "node:fs";

import { Router } from "express";

import { resolveDesktopDataFile } from "./desktopDataDir.js";

const MAX_CHATS_SIZE = 5 * 1024 * 1024;

function storePath() {
  return resolveDesktopDataFile("ttd-chats.json");
}

function readChats() {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeChats(chats) {
  fs.writeFileSync(storePath(), JSON.stringify(chats), "utf8");
}

/** Desktop TTD chats — JSON file persistence, no SQLite. */
export function createDesktopTtdChatsRouter() {
  const router = Router();

  router.get("/", (_req, res) => {
    try {
      return res.json(readChats());
    } catch (error) {
      console.error("[ttd-chats] GET", error);
      return res.status(500).json({ error: "failed to read ttd chats" });
    }
  });

  router.put("/", (req, res) => {
    try {
      const chats = req.body;
      if (!Array.isArray(chats)) {
        return res.status(400).json({ error: "body must be an array" });
      }
      const json = JSON.stringify(chats);
      if (json.length > MAX_CHATS_SIZE) {
        return res.status(413).json({ error: "chats payload too large" });
      }
      writeChats(chats);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[ttd-chats] PUT", error);
      return res.status(500).json({ error: "failed to save ttd chats" });
    }
  });

  return router;
}
