const CHERRY_STUDIO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CherryStudio/1.9.6 Chrome/146.0.7680.188 Electron/41.2.1 Safari/537.36";

export const AI_UPSTREAM_PROFILE = {
  DEFAULT: "default",
  CHERRY_STUDIO: "cherry-studio",
};

export function normalizeBearerToken(apiKey = "") {
  return String(apiKey)
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}

export function buildUpstreamHeaders({
  apiKey,
  profile = AI_UPSTREAM_PROFILE.CHERRY_STUDIO,
} = {}) {
  const token = normalizeBearerToken(apiKey);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (profile === AI_UPSTREAM_PROFILE.CHERRY_STUDIO) {
    return {
      ...headers,
      "User-Agent": CHERRY_STUDIO_USER_AGENT,
      "x-title": "Cherry Studio",
      "http-referer": "https://cherry-ai.com",
      Referer: "https://cherry-ai.com/",
      Origin: "https://cherry-ai.com",
      "accept-language": "zh-CN",
    };
  }

  return headers;
}
