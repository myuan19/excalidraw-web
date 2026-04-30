import { createLogger } from "../lib/logger";

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
  const opts: RequestInit = {
    cache: "no-store",
    headers: { Accept: "image/svg+xml,text/plain,*/*;q=0.8,*/*;q=0.1" },
  };

  async function attempt(url: string, label: "A" | "B") {
    logPipe.debug("GET thumb request", {
      id8,
      step: label,
      urlLen: url.length,
      urlTail: url.slice(-120),
    });
    const res = await fetch(url, opts);
    const raw = await res.text().catch((e: unknown) => {
      logPipe.debug("GET thumb text() threw", {
        id8,
        step: label,
        err: String(e),
      });
      return "";
    });
    logPipe.debug("GET thumb response", {
      id8,
      step: label,
      http: res.status,
      ok: res.ok,
      ct: res.headers.get("content-type"),
      bodyLen: raw.length,
      bodyEmpty: !raw.trim(),
      head: raw.trim().slice(0, 140),
    });
    if (!res.ok) {
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
  } else {
    logPipe.debug("GET thumb OK", {
      id8,
      status: r.status,
      svgLen: r.body.length,
      startsSvg: /^[\s\S]*<svg\b/i.test(r.body),
    });
  }
  return { svg: t ? r.body : null, status: r.status };
}
