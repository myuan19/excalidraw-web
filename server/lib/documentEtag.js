/** Normalize ETag / If-None-Match for document payloads (content_sha256). */

export function formatDocumentEtag(contentSha256) {
  if (!contentSha256 || typeof contentSha256 !== "string") {
    return null;
  }
  const trimmed = contentSha256.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
}

export function parseIfNoneMatch(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return [];
  }
  return headerValue
    .split(",")
    .map((part) => part.trim().replace(/^W\//, "").replace(/^"|"$/g, ""))
    .filter(Boolean);
}

export function ifNoneMatchSatisfied(ifNoneMatchHeader, contentSha256) {
  const etag = formatDocumentEtag(contentSha256);
  if (!etag) {
    return false;
  }
  const normalized = etag.replace(/^"|"$/g, "");
  const candidates = parseIfNoneMatch(ifNoneMatchHeader);
  return candidates.includes(normalized) || candidates.includes("*");
}

export function sendNotModified(res, contentSha256) {
  const etag = formatDocumentEtag(contentSha256);
  if (etag) {
    res.setHeader("ETag", etag);
  }
  res.setHeader("Cache-Control", "private, no-cache");
  return res.status(304).end();
}

/** PUT precondition: absent header allows write; present header must match current sha. */
export function ifMatchAllowsWrite(ifMatchHeader, contentSha256) {
  if (!ifMatchHeader || !String(ifMatchHeader).trim()) {
    return true;
  }
  if (!contentSha256) {
    return true;
  }
  return ifNoneMatchSatisfied(ifMatchHeader, contentSha256);
}
