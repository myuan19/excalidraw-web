/** Draft / new-document routing via URL hash. */

import { isLocalDraftFileId } from "./localDraftFileId";

export { isLocalDraftFileId };

const LEGACY_TEMP_PREFIX = "local-temp:";

export function parseHashParams(hash?: string): URLSearchParams {
  const h =
    hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const raw = h.startsWith("#") ? h.slice(1) : h;
  return new URLSearchParams(raw);
}

export function isNewDocumentHash(hash?: string): boolean {
  return parseHashParams(hash).get("new") === "1";
}

export function isAddLibraryHash(hash?: string): boolean {
  return parseHashParams(hash).has("addLibrary");
}

export function hashNeedsEditorRoute(hash?: string): boolean {
  const h =
    hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  if (h.startsWith("#file=") || isAddLibraryHash(h)) {
    return true;
  }
  return isNewDocumentHash(h);
}

export function isLegacyTempFileId(id: string): boolean {
  return id.startsWith(LEGACY_TEMP_PREFIX);
}

/** One-time cleanup after removing local temp-file storage. */
export function purgeLegacyTempArtifacts(): void {
  try {
    localStorage.removeItem("editorhub-temp-files-v1");
  } catch {
    /* ignore */
  }
}
