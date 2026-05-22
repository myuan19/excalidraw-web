const EMBED_MINDMAP_PREFIX = "/embed/mind-map/";

function shouldSkipUrl(url) {
  return /^(?:data:|blob:|https?:|mailto:|#)/i.test(url);
}

function appendEmbedToken(url, encodedToken) {
  if (!encodedToken || /[?&]_t=/.test(url)) return url;
  const hashIndex = url.indexOf("#");
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  return `${withoutHash}${withoutHash.includes("?") ? "&" : "?"}_t=${encodedToken}${hash}`;
}

export function isAllowedMindMapEmbedAssetPath(assetPath) {
  return assetPath === "index.html" || assetPath.startsWith("dist/");
}

function rewriteMindMapHtmlResourceUrl(url, encodedToken) {
  const normalized = url.trim();
  if (!normalized || shouldSkipUrl(normalized)) return url;
  if (normalized.startsWith(EMBED_MINDMAP_PREFIX)) return appendEmbedToken(normalized, encodedToken);
  if (normalized.startsWith("/mind-map/")) {
    return appendEmbedToken(`${EMBED_MINDMAP_PREFIX}${normalized.slice("/mind-map/".length)}`, encodedToken);
  }
  const relative = normalized.replace(/^\.\//, "");
  if (relative.startsWith("dist/")) return appendEmbedToken(`${EMBED_MINDMAP_PREFIX}${relative}`, encodedToken);
  return url;
}

function rewriteMindMapCssResourceUrl(url, assetPath, encodedToken) {
  const normalized = url.trim();
  if (!normalized || shouldSkipUrl(normalized)) return url;
  if (normalized.startsWith(EMBED_MINDMAP_PREFIX)) return appendEmbedToken(normalized, encodedToken);
  if (normalized.startsWith("/mind-map/")) {
    return appendEmbedToken(`${EMBED_MINDMAP_PREFIX}${normalized.slice("/mind-map/".length)}`, encodedToken);
  }
  try {
    const base = `https://embed.local${EMBED_MINDMAP_PREFIX}${assetPath}`;
    const resolved = new URL(normalized, base);
    const rewritten = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    if (!rewritten.startsWith(EMBED_MINDMAP_PREFIX)) return url;
    return appendEmbedToken(rewritten, encodedToken);
  } catch {
    return url;
  }
}

export function rewriteMindMapHtmlForEmbed(html, encodedToken) {
  return html.replace(/((?:src|href)=["'])([^"']+)(["'])/g, (match, prefix, url, suffix) => {
    const rewritten = rewriteMindMapHtmlResourceUrl(url, encodedToken);
    return rewritten === url ? match : `${prefix}${rewritten}${suffix}`;
  });
}

export function rewriteMindMapCssForEmbed(css, assetPath, encodedToken) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, quote, url) => {
    const rewritten = rewriteMindMapCssResourceUrl(url, assetPath, encodedToken);
    return rewritten === url ? match : `url(${quote}${rewritten}${quote})`;
  });
}
