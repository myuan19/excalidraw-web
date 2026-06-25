import { createLogger } from "../lib/logger";
import { apiTransport } from "./apiTransport";
import { decodeMindMapThumbnailPayload } from "./thumbnailSvg";

const logPipe = createLogger({ module: "thumbPipeline" });

/**
 * 拉取卡片缩略图 SVG。首个 200 但正文为空时再带 `_bust` 重试。
 */
export async function fetchThumbnailSvgForCard(
  urlPath: string,
  ctx: { id8: string },
): Promise<{
  svg: string | null;
  status: number;
  errPreview?: string;
}> {
  const { id8 } = ctx;
  const hasImmutableHash = /[?&]h=/.test(urlPath);
  const requestHeaders = {
    Accept: "image/svg+xml,text/plain,*/*;q=0.8,*/*;q=0.1",
    "Cache-Control": hasImmutableHash ? "max-age=31536000" : "no-store",
  };

  async function attempt(url: string, label: "A" | "B") {
    logPipe.debug("GET thumb request", {
      id8,
      step: label,
      urlLen: url.length,
      urlTail: url.slice(-120),
    });
    const path = url.startsWith("/api/") ? url : `/api${url}`;
    const res = await apiTransport.request({
      method: "GET",
      path,
      headers: requestHeaders,
    });
    const raw = res.bodyText;
    logPipe.debug("GET thumb response", {
      id8,
      step: label,
      http: res.status,
      ok: res.status >= 200 && res.status < 300,
      ct: res.headers["content-type"],
      bodyLen: raw.length,
      bodyEmpty: !raw.trim(),
      head: raw.trim().slice(0, 140),
    });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false as const, status: res.status, body: raw };
    }
    return { ok: true as const, status: res.status, body: raw };
  }

  let r = await attempt(urlPath, "A");
  if (r.ok && !r.body.trim() && typeof window !== "undefined") {
    logPipe.debug("GET thumb 200 but empty body → bust retry", {
      id8,
      hadQuery: urlPath.includes("?"),
    });
    const u = new URL(urlPath, window.location.origin);
    u.searchParams.set("_bust", `${Date.now()}`);
    const alt = `${u.pathname}${u.search}`;
    r = await attempt(alt, "B");
  }
  if (!r.ok) {
    logPipe.debug("GET thumb final fail", {
      id8,
      status: r.status,
      errPreview: r.body.slice(0, 220),
    });
    return {
      svg: null,
      status: r.status,
      errPreview: r.body.slice(0, 220),
    };
  }
  const t = r.body.trim();
  if (!t) {
    logPipe.debug("GET thumb final empty SVG after retries", {
      id8,
      status: r.status,
    });
    return { svg: null, status: r.status };
  }
  const decoded = decodeMindMapThumbnailPayload(t) ?? t;
  logPipe.debug("GET thumb OK", {
    id8,
    status: r.status,
    svgLen: decoded.length,
    startsSvg: /^[\s\S]*<svg\b/i.test(decoded),
    wasDataUrl: t !== decoded,
  });
  return { svg: decoded, status: r.status };
}
