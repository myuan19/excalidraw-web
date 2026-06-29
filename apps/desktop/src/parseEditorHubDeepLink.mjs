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

const FILE_ID_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * @param {string} rawFileParam
 * @returns {string}
 */
export function sanitizeFileIdFromHashValue(rawFileParam) {
  let value = rawFileParam;
  try {
    value = decodeURIComponent(rawFileParam);
  } catch {
    /* keep raw */
  }
  const nestedIdx = value.search(/#addLibrary=|addLibrary=/i);
  if (nestedIdx >= 0) {
    value = value.slice(0, nestedIdx).replace(/[&?]$/, "");
  }
  const uuidMatch = value.match(FILE_ID_RE);
  if (uuidMatch) {
    return uuidMatch[1];
  }
  return value.split("&")[0]?.split("#")[0]?.trim() ?? value;
}

/**
 * @param {string} hash
 * @returns {{ libraryUrl: string, idToken: string | null } | null}
 */
export function parseLibraryImportTokensFromHashString(hash) {
  if (!hash || !hash.includes("addLibrary")) {
    return null;
  }
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  let libraryUrl = null;
  let idToken = null;

  const params = new URLSearchParams(raw.split("#").pop() ?? raw);
  libraryUrl = params.get("addLibrary");
  idToken = params.get("token");

  if (!libraryUrl) {
    const match = raw.match(/addLibrary=([^&]+)/);
    libraryUrl = match?.[1] ?? null;
  }
  if (!idToken) {
    const match = raw.match(/(?:^|&)token=([^&]+)/);
    idToken = match?.[1] ?? null;
  }
  if (!libraryUrl) {
    try {
      const decoded = decodeURIComponent(raw);
      const match = decoded.match(/addLibrary=([^&]+)/);
      libraryUrl = match?.[1] ?? null;
    } catch {
      /* ignore */
    }
  }
  if (!libraryUrl) {
    return null;
  }
  try {
    libraryUrl = decodeURIComponent(libraryUrl);
  } catch {
    /* keep raw */
  }
  return { libraryUrl, idToken };
}

/**
 * Normalize mangled library-install deep links to a clean file hash + tokens.
 * @param {string} hash
 * @returns {{ navigationHash: string, tokens: { libraryUrl: string, idToken: string | null } | null }}
 */
export function normalizeLibraryImportDeepLinkHash(hash) {
  if (!hash || !hash.includes("addLibrary")) {
    return { navigationHash: hash, tokens: null };
  }

  const tokens = parseLibraryImportTokensFromHashString(hash);
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw.split("#")[0] ?? raw);
  const fileParam = params.get("file");
  if (!fileParam) {
    return { navigationHash: "", tokens };
  }
  const fileId = sanitizeFileIdFromHashValue(fileParam);
  const kind = params.get("kind");
  const next = new URLSearchParams({ file: fileId });
  if (kind) {
    next.set("kind", kind);
  }
  return { navigationHash: `#${next.toString()}`, tokens };
}
