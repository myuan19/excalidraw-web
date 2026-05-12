export function getEmbedResourceTokenQuery(): string {
  const search = new URLSearchParams(window.location.search);
  const token =
    search.get("token") ||
    search.get("_t") ||
    window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.token;
  return token ? `?_t=${encodeURIComponent(token)}` : "";
}
