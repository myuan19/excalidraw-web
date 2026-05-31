const EMBED_MINDMAP_PREFIX = "/embed/mind-map/";

function shouldSkipUrl(url) {
  return /^(?:data:|blob:|https?:|mailto:|#)/i.test(url);
}

export function isAllowedMindMapEmbedAssetPath(assetPath) {
  return assetPath === "index.html" || assetPath.startsWith("dist/");
}

function rewriteMindMapHtmlResourceUrl(url, encodedToken) {
  const normalized = url.trim();
  if (!normalized || shouldSkipUrl(normalized)) {
    return url;
  }

  if (normalized.startsWith(EMBED_MINDMAP_PREFIX)) {
    return normalized;
  }

  if (normalized.startsWith("/mind-map/")) {
    return `${EMBED_MINDMAP_PREFIX}${normalized.slice("/mind-map/".length)}`;
  }

  const relative = normalized.replace(/^\.\//, "");
  if (relative.startsWith("dist/")) {
    return `${EMBED_MINDMAP_PREFIX}${relative}`;
  }

  return url;
}

function rewriteMindMapCssResourceUrl(url, assetPath) {
  const normalized = url.trim();
  if (!normalized || shouldSkipUrl(normalized)) {
    return url;
  }

  if (normalized.startsWith(EMBED_MINDMAP_PREFIX)) {
    return normalized;
  }

  if (normalized.startsWith("/mind-map/")) {
    return `${EMBED_MINDMAP_PREFIX}${normalized.slice("/mind-map/".length)}`;
  }

  try {
    const base = `https://embed.local${EMBED_MINDMAP_PREFIX}${assetPath}`;
    const resolved = new URL(normalized, base);
    const rewritten = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    if (!rewritten.startsWith(EMBED_MINDMAP_PREFIX)) {
      return url;
    }
    return rewritten;
  } catch {
    return url;
  }
}

export function rewriteMindMapHtmlForEmbed(html, _encodedToken = "") {
  return html.replace(
    /((?:src|href)=["'])([^"']+)(["'])/g,
    (match, prefix, url, suffix) => {
      const rewritten = rewriteMindMapHtmlResourceUrl(url, _encodedToken);
      return rewritten === url ? match : `${prefix}${rewritten}${suffix}`;
    },
  );
}

export function rewriteMindMapCssForEmbed(css, assetPath, _encodedToken = "") {
  return css.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
    (match, quote, url) => {
      const rewritten = rewriteMindMapCssResourceUrl(url, assetPath);
      return rewritten === url ? match : `url(${quote}${rewritten}${quote})`;
    },
  );
}
