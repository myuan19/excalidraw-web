import { isDesktopEditorHub } from "../lib/runtimePlatform";

import { apiTransport } from "./apiTransport";

export interface EmbedToken {
  id: string;
  token: string;
  file_id: string;
  allowed_domains: string;
  created_at: string;
  usage_count: number;
}

function embedUnavailableOnDesktop(): boolean {
  return isDesktopEditorHub();
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (embedUnavailableOnDesktop()) {
    throw new Error("Embed tokens are not available in the desktop app");
  }
  const res = await apiTransport.request({
    method: opts.method ?? "GET",
    path: `/api/embed-tokens${path}`,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> | undefined),
    },
    body:
      opts.body == null
        ? null
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`API ${res.status}: ${res.bodyText}`);
  }
  return JSON.parse(res.bodyText) as T;
}

export function listTokens(fileId: string): Promise<EmbedToken[]> {
  if (embedUnavailableOnDesktop()) {
    return Promise.resolve([]);
  }
  return apiFetch<EmbedToken[]>(`?file_id=${encodeURIComponent(fileId)}`);
}

export function createToken(params: {
  file_id: string;
  allowed_domains?: string;
}): Promise<EmbedToken> {
  if (embedUnavailableOnDesktop()) {
    throw new Error("Embed tokens are not available in the desktop app");
  }
  return apiFetch<EmbedToken>("", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function updateTokenDomains(
  id: string,
  allowedDomains: string,
): Promise<EmbedToken> {
  if (embedUnavailableOnDesktop()) {
    throw new Error("Embed tokens are not available in the desktop app");
  }
  return apiFetch<EmbedToken>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ allowed_domains: allowedDomains }),
  });
}

export function deleteToken(id: string): Promise<{ ok: boolean }> {
  if (embedUnavailableOnDesktop()) {
    throw new Error("Embed tokens are not available in the desktop app");
  }
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
