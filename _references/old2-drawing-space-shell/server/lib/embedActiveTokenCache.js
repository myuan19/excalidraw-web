import db from "../db.js";
import { createEmbedTokenActiveCache } from "./embedTokenCache.js";

export const embedTokenActiveCache = createEmbedTokenActiveCache({
  ttlMs: 10_000,
  now: () => Date.now(),
  lookup(token) {
    if (!token) return false;
    return !!db.prepare("SELECT id FROM embed_tokens WHERE token = ?").get(token);
  },
});
