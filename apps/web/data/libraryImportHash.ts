import type { LibraryUrlImportTokens } from "./libraryUrlImport";

const FILE_ID_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * libraries.excalidraw.com appends `#addLibrary=` to the referrer URL.
 * When referrer already contains `#file=…`, the result is a mangled hash like:
 * `#file=<uuid>%23addLibrary%3D<url>#addLibrary=<url>&token=…`
 * URLSearchParams cannot parse `addLibrary` from that shape.
 */
export function parseLibraryImportTokensFromHash(
  hash = typeof window !== "undefined" ? window.location.hash : "",
): LibraryUrlImportTokens | null {
  if (!hash || !hash.includes("addLibrary")) {
    return null;
  }

  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  let libraryUrl: string | null = null;
  let idToken: string | null = null;

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

/** Strip accidental `%23addLibrary…` suffix from a `#file=` id. */
export function sanitizeFileIdFromHashValue(rawFileParam: string): string {
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
    return uuidMatch[1]!;
  }

  return value.split("&")[0]?.split("#")[0]?.trim() ?? value;
}

/** Normalize a mangled post-install hash to `#file=<uuid>` when possible. */
export function normalizeFileHashAfterLibraryImport(
  hash = typeof window !== "undefined" ? window.location.hash : "",
): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw.split("#")[0] ?? raw);
  const fileParam = params.get("file");
  if (!fileParam) {
    return hash.includes("addLibrary") ? "" : hash;
  }
  const fileId = sanitizeFileIdFromHashValue(fileParam);
  const kind = params.get("kind");
  if (!fileId) {
    return "";
  }
  const next = new URLSearchParams({ file: fileId });
  if (kind) {
    next.set("kind", kind);
  }
  return `#${next.toString()}`;
}
