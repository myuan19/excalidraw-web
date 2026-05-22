export function createEmbedTokenActiveCache({ ttlMs, now, lookup }) {
  const entries = new Map();

  return {
    isActive(token) {
      if (!token) return false;
      const key = String(token);
      const currentTime = now();
      const cached = entries.get(key);
      if (cached && cached.expiresAt > currentTime) return true;
      const active = !!lookup(key);
      if (active) entries.set(key, { expiresAt: currentTime + ttlMs });
      else entries.delete(key);
      return active;
    },

    clear(token) {
      if (token) entries.delete(String(token));
      else entries.clear();
    },
  };
}
