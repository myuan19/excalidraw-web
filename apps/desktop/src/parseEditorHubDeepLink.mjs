export const EDITORHUB_SCHEME = "editorhub";
export const EDITORHUB_APP_HOST = "app";

/**
 * Normalize an editorhub:// deep link (pathname + hash preserved).
 * @param {string} url
 * @returns {string | null}
 */
export function normalizeEditorHubDeepLink(url) {
  const raw = String(url ?? "").trim();
  if (!raw.startsWith(`${EDITORHUB_SCHEME}://`)) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== `${EDITORHUB_SCHEME}:`) {
      return null;
    }
    if (parsed.hostname !== EDITORHUB_APP_HOST) {
      return null;
    }
    const pathname = parsed.pathname || "/index.html";
    return `${EDITORHUB_SCHEME}://${EDITORHUB_APP_HOST}${pathname}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * @param {string[] | undefined} argv
 * @returns {string | null}
 */
export function parseEditorHubDeepLinkFromArgv(argv = process.argv) {
  for (const arg of argv) {
    const normalized = normalizeEditorHubDeepLink(arg);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

/**
 * @param {string} currentUrl
 * @param {string} targetUrl
 */
export function editorHubUrlsShareAppDocument(currentUrl, targetUrl) {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return (
      current.protocol === `${EDITORHUB_SCHEME}:` &&
      target.protocol === `${EDITORHUB_SCHEME}:` &&
      current.hostname === EDITORHUB_APP_HOST &&
      target.hostname === EDITORHUB_APP_HOST &&
      current.pathname === target.pathname
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @returns {string}
 */
export function editorHubHashFromUrl(url) {
  const index = url.indexOf("#");
  return index >= 0 ? url.slice(index) : "";
}
