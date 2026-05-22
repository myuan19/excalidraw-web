import { ServerSync } from "@/services/ServerSync";

const TTD_CHATS_KEY = "drawing-space-ttd-chats";

export type SavedTTDChats = unknown[];

function readLocalChats(): SavedTTDChats {
  try {
    const raw = localStorage.getItem(TTD_CHATS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalChats(chats: SavedTTDChats) {
  try {
    localStorage.setItem(TTD_CHATS_KEY, JSON.stringify(chats));
  } catch {
    // Local TTD history is best-effort.
  }
}

export const TTDPersistence = {
  async loadChats(): Promise<SavedTTDChats> {
    try {
      const chats = await ServerSync.getTTDChats();
      if (Array.isArray(chats)) {
        writeLocalChats(chats);
        return chats;
      }
    } catch {
      // fall back to local mirror below
    }
    return readLocalChats();
  },

  async saveChats(chats: SavedTTDChats): Promise<void> {
    writeLocalChats(chats);
    try {
      await ServerSync.saveTTDChats(chats);
    } catch {
      // Keep local mirror if server is temporarily unavailable.
    }
  },
};
