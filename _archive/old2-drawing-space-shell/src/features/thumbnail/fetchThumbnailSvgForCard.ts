export async function fetchThumbnailSvgForCard(
  urlPath: string,
): Promise<{ svg: string | null; status: number; errPreview?: string }> {
  async function attempt(url: string) {
    const res = await fetch(url, {
      cache: /[?&]h=/.test(url) ? "force-cache" : "no-store",
      headers: { Accept: "image/svg+xml,text/plain,*/*;q=0.8" },
    });
    const body = await res.text().catch(() => "");
    return { res, body };
  }

  let result = await attempt(urlPath);
  if (result.res.ok && !result.body.trim()) {
    const url = new URL(urlPath, window.location.origin);
    url.searchParams.set("_bust", String(Date.now()));
    result = await attempt(`${url.pathname}${url.search}`);
  }

  if (!result.res.ok) {
    return {
      svg: null,
      status: result.res.status,
      errPreview: result.body.slice(0, 220),
    };
  }

  const svg = result.body.trim();
  return { svg: svg ? result.body : null, status: result.res.status };
}
