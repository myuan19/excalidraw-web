const DEFAULT_MINDMAP_URL = "/mind-map/index.html";

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function resolveMindMapAssetUrl(src: string, htmlUrl = DEFAULT_MINDMAP_URL) {
  return new URL(src, window.location.origin + htmlUrl).pathname;
}

export function extractMindMapAssetUrls(
  html: string,
  htmlUrl = DEFAULT_MINDMAP_URL,
): string[] {
  const urls: string[] = [];
  const assetPattern =
    /<(script|link)\b[^>]*(?:src|href)=["']?([^"'\s>]+)["']?[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = assetPattern.exec(html))) {
    const url = resolveMindMapAssetUrl(match[2], htmlUrl);
    if (/\.(js|css)(?:$|\?)/.test(url)) {
      urls.push(url);
    }
  }
  return unique(urls);
}

function appendPrefetchLink(url: string) {
  if (document.querySelector(`link[data-mindmap-prefetch="${url}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url;
  link.dataset.mindmapPrefetch = url;
  if (url.endsWith(".js")) {
    link.as = "script";
  } else if (url.endsWith(".css")) {
    link.as = "style";
  }
  document.head.appendChild(link);
}

export async function prefetchMindMapNativeAssets(
  htmlUrl = DEFAULT_MINDMAP_URL,
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  try {
    const response = await fetch(htmlUrl, { cache: "force-cache" });
    if (!response.ok) {
      return;
    }
    const html = await response.text();
    for (const assetUrl of extractMindMapAssetUrls(html, htmlUrl)) {
      appendPrefetchLink(assetUrl);
    }
  } catch {
    // Prefetch is best-effort and must never affect opening files.
  }
}
