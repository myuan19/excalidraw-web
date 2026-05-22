export interface EmbedToken {
  id: string;
  token: string;
  file_id: string;
  allowed_domains: string;
  created_at: string;
  usage_count: number;
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/embed-tokens${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function listTokens(fileId: string): Promise<EmbedToken[]> {
  return apiFetch<EmbedToken[]>(`?file_id=${encodeURIComponent(fileId)}`);
}

export function createToken(params: {
  file_id: string;
  allowed_domains?: string;
}): Promise<EmbedToken> {
  return apiFetch<EmbedToken>("", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function updateTokenDomains(
  id: string,
  allowedDomains: string,
): Promise<EmbedToken> {
  return apiFetch<EmbedToken>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ allowed_domains: allowedDomains }),
  });
}

export function deleteToken(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/${id}`, { method: "DELETE" });
}

export function buildEmbedUrl(
  fileId: string,
  token: string,
  baseUrl?: string,
): string {
  const base = baseUrl || window.location.origin;
  return `${base}/embed/${fileId}?token=${token}`;
}

export function buildIframeSnippet(
  fileId: string,
  token: string,
  baseUrl?: string,
): string {
  const url = buildEmbedUrl(fileId, token, baseUrl);
  return `<iframe\n  src="${url}"\n  width="100%"\n  height="600"\n  style="border: none; border-radius: 8px;"\n  loading="lazy">\n</iframe>`;
}
