import {
  logDocumentVersion,
  type DocumentVersionContext,
} from "./documentVersionLog";

export const DOCUMENT_VERSION_MAX = 2_147_483_647;
export const DOCUMENT_VERSION_MODULUS = DOCUMENT_VERSION_MAX + 1;

const sessionVersions = new Map<string, number>();

export type { DocumentVersionContext };

export type VersionOrder = "same" | "newer" | "older" | "ambiguous";

export function isValidDocumentVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= DOCUMENT_VERSION_MAX
  );
}

export function compareDocumentVersions(a: number, b: number): VersionOrder {
  if (a === b) {
    return "same";
  }
  const forward = (a - b + DOCUMENT_VERSION_MODULUS) % DOCUMENT_VERSION_MODULUS;
  const half = DOCUMENT_VERSION_MODULUS / 2;
  if (forward === half) {
    return "ambiguous";
  }
  return forward < half ? "newer" : "older";
}

export function getDocumentSessionVersion(fileId: string): number | null {
  return sessionVersions.get(fileId) ?? null;
}

export function setDocumentSessionVersion(
  fileId: string,
  version: unknown,
  ctx?: DocumentVersionContext,
): void {
  if (!isValidDocumentVersion(version)) {
    return;
  }
  const previous = sessionVersions.get(fileId) ?? null;
  if (previous === version) {
    if (ctx?.reason) {
      logDocumentVersion({
        action: "session-unchanged",
        fileId,
        reason: ctx.reason,
        previousSessionVersion: previous,
        sessionVersion: version,
        serverVersion: ctx.serverVersion ?? version,
        cacheVersion: ctx.cacheVersion,
        expectedVersion: ctx.expectedVersion,
        forceOverwrite: ctx.forceOverwrite,
      });
    }
    return;
  }
  sessionVersions.set(fileId, version);
  logDocumentVersion({
    action: "session-set",
    fileId,
    reason: ctx?.reason,
    previousSessionVersion: previous,
    sessionVersion: version,
    serverVersion: ctx?.serverVersion ?? version,
    cacheVersion: ctx?.cacheVersion,
    expectedVersion: ctx?.expectedVersion,
    forceOverwrite: ctx?.forceOverwrite,
  });
}

export function clearDocumentSessionVersion(
  fileId: string,
  reason?: string,
): void {
  const previous = sessionVersions.get(fileId) ?? null;
  if (previous == null) {
    return;
  }
  sessionVersions.delete(fileId);
  logDocumentVersion({
    action: "session-clear",
    fileId,
    reason,
    previousSessionVersion: previous,
    sessionVersion: null,
  });
}
