/**
 * Embed access control — single source of truth.
 *
 * Order: establish embedding context (Referer / signed session) → validate token
 * → enforce per-token domain allowlist. Wildcard (*) skips domain allowlist.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const EMBED_TOKEN_COOKIE = "__embed_t";
export const EMBED_CONTEXT_COOKIE = "__embed_ctx";
export const EMBED_COOKIE_PATH = "/embed";
export const EMBED_COOKIE_MAX_AGE_SEC = 3600;
export const EMBED_CONTEXT_VERSION = 1;

let warnedMissingEmbedSecret = false;

export function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) {
    return "";
  }
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    )
  ) {
    return "";
  }
  return host;
}

export function parseAllowedDomainsInput(value) {
  if (typeof value !== "string") {
    return "*";
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") {
    return "*";
  }
  const domains = [];
  for (const part of trimmed.split(",")) {
    const raw = part.trim();
    const host = normalizeHost(raw);
    if (!raw || !host) {
      return null;
    }
    if (!domains.includes(host)) {
      domains.push(host);
    }
  }
  return domains.length ? domains.join(",") : null;
}

export function isWildcardAllowedDomains(allowedDomains) {
  return !allowedDomains || allowedDomains === "*";
}

export function parseAllowedDomainList(allowedDomains) {
  if (isWildcardAllowedDomains(allowedDomains)) {
    return [];
  }
  return allowedDomains
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
}

export function isHostInAllowedList(embeddingHost, allowedDomains) {
  if (isWildcardAllowedDomains(allowedDomains)) {
    return true;
  }
  const host = normalizeHost(embeddingHost);
  if (!host) {
    return false;
  }
  const allowed = parseAllowedDomainList(allowedDomains);
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

export function getRequestHost(req) {
  const rawHost = req.get("host") || "";
  return normalizeHost(rawHost.split(",")[0].split(":")[0]);
}

export function hostFromReferer(req) {
  const referer = req.get("referer");
  if (!referer) {
    return "";
  }
  try {
    return normalizeHost(new URL(referer).hostname);
  } catch {
    return "";
  }
}

/** File id from parent embed document URL (subresource Referer). */
export function extractEmbedFileIdFromReferer(req) {
  const referer = req.get("referer");
  if (!referer) {
    return "";
  }
  try {
    const match = new URL(referer).pathname.match(/^\/embed\/([^/]+)/);
    const candidate = match?.[1] ?? "";
    if (
      !candidate ||
      candidate === "api" ||
      candidate === "assets" ||
      candidate === "fonts" ||
      candidate === "mind-map"
    ) {
      return "";
    }
    return candidate;
  } catch {
    return "";
  }
}

/** Resolve embed file id for /embed/mind-map/* and other routes without :fileId param. */
export function getEmbedRequestFileId(req) {
  const fromQuery = req.query?.fileId ?? req.query?.fid;
  if (typeof fromQuery === "string" && fromQuery.trim()) {
    return fromQuery.trim();
  }
  const ctx = readEmbedContextCookie(req);
  if (ctx?.fileId) {
    return ctx.fileId;
  }
  if (typeof req.params?.fileId === "string" && req.params.fileId) {
    return req.params.fileId;
  }
  return extractEmbedFileIdFromReferer(req) || "";
}

export function getEmbedTokenCookie(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${EMBED_TOKEN_COOKIE}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function getEmbedRefererToken(req) {
  const referer = req.get("referer");
  if (!referer) {
    return null;
  }
  try {
    const url = new URL(referer);
    return url.searchParams.get("_t") || url.searchParams.get("token");
  } catch {
    return null;
  }
}

/** Token from query, cookie, or parent referer URL. */
export function getEmbedRequestToken(req) {
  return (
    req.query._t ||
    req.query.token ||
    getEmbedTokenCookie(req) ||
    getEmbedRefererToken(req) ||
    null
  );
}

function getEmbedSessionSecret() {
  const secret = process.env.EMBED_SESSION_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (
    !warnedMissingEmbedSecret &&
    (process.env.NODE_ENV === "production" ||
      (process.env.SERVE_SPA || "").trim() === "1")
  ) {
    warnedMissingEmbedSecret = true;
    console.warn(
      "[embed] EMBED_SESSION_SECRET is unset; using dev-only default. Set a stable secret in production.",
    );
  }
  return "dev-only-embed-session-secret";
}

function encodeContextPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signContextPayload(encodedPayload) {
  return createHmac("sha256", getEmbedSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * @returns {{ tokenId: string, fileId: string, embeddingHost: string, exp: number } | null}
 */
export function readEmbedContextCookie(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${EMBED_CONTEXT_COOKIE}=([^;]+)`),
  );
  if (!match) {
    return null;
  }
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const encodedPayload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqualString(signContextPayload(encodedPayload), signature)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (payload?.v !== EMBED_CONTEXT_VERSION) {
      return null;
    }
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) {
      return null;
    }
    const embeddingHost = normalizeHost(payload.host);
    const fileId = typeof payload.fid === "string" ? payload.fid : "";
    const tokenId = typeof payload.tid === "string" ? payload.tid : "";
    if (!embeddingHost || !fileId || !tokenId) {
      return null;
    }
    return {
      tokenId,
      fileId,
      embeddingHost,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function hasEmbeddingContextSignal(req) {
  if (readEmbedContextCookie(req)) {
    return true;
  }
  return !!hostFromReferer(req);
}

/**
 * Parent / embedding site hostname for this request.
 * Cookie session wins (subresources & in-embed API). Otherwise Referer host.
 */
export function resolveEmbeddingHost(req) {
  const ctx = readEmbedContextCookie(req);
  if (ctx?.embeddingHost) {
    return ctx.embeddingHost;
  }
  return hostFromReferer(req) || "";
}

export function captureEmbeddingHostForSession(req) {
  const ctx = readEmbedContextCookie(req);
  if (ctx?.embeddingHost) {
    return ctx.embeddingHost;
  }
  const refererHost = hostFromReferer(req);
  if (refererHost) {
    return refererHost;
  }
  return "";
}

export function buildEmbedContextCookieValue({
  tokenId,
  fileId,
  embeddingHost,
  maxAgeSec = EMBED_COOKIE_MAX_AGE_SEC,
}) {
  const host = normalizeHost(embeddingHost);
  if (!host) {
    throw new Error("embeddingHost required for embed context cookie");
  }
  const exp = Date.now() + maxAgeSec * 1000;
  const encodedPayload = encodeContextPayload({
    v: EMBED_CONTEXT_VERSION,
    tid: tokenId,
    fid: fileId,
    host,
    exp,
  });
  return `${encodedPayload}.${signContextPayload(encodedPayload)}`;
}

export function appendEmbedSetCookie(res, name, value) {
  const base = `${name}=${encodeURIComponent(value)}; Path=${EMBED_COOKIE_PATH}; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${EMBED_COOKIE_MAX_AGE_SEC}`;
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", base);
    return;
  }
  const cookies = Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader("Set-Cookie", [...cookies, base]);
}

export function issueEmbedSessionCookies(res, { token, tokenId, fileId, embeddingHost }) {
  appendEmbedSetCookie(res, EMBED_TOKEN_COOKIE, token);
  const contextValue = buildEmbedContextCookieValue({
    tokenId,
    fileId,
    embeddingHost,
  });
  appendEmbedSetCookie(res, EMBED_CONTEXT_COOKIE, contextValue);
}

export function buildFrameAncestors(allowedDomains) {
  const extensionSchemes = "chrome-extension: moz-extension:";
  if (isWildcardAllowedDomains(allowedDomains)) {
    return `* ${extensionSchemes}`;
  }
  const hosts = parseAllowedDomainList(allowedDomains);
  if (hosts.length === 0) {
    return `* ${extensionSchemes}`;
  }
  return (
    hosts.map((h) => `https://${h} http://${h}`).join(" ") +
    ` ${extensionSchemes}`
  );
}

/**
 * @typedef {{ ok: true, row: object, embeddingHost: string }} EmbedAccessOk
 * @typedef {{ ok: false, status: number, error: string }} EmbedAccessFail
 */

/**
 * Validate embed access: domain context → token → allowlist.
 * @param {import('express').Request} req
 * @param {{ fileId: string, token: string | null | undefined, lookupToken: (token: string, fileId: string) => object | undefined }} input
 * @returns {EmbedAccessOk | EmbedAccessFail}
 */
export function validateEmbedAccess(req, { fileId, token, lookupToken }) {
  const hasSignal = hasEmbeddingContextSignal(req);
  const embeddingHost = resolveEmbeddingHost(req);

  if (!token) {
    return {
      ok: false,
      status: 403,
      error: hasSignal ? "Missing embed token" : "Domain not allowed",
    };
  }

  const row = lookupToken(String(token), fileId);
  if (!row) {
    return { ok: false, status: 403, error: "Invalid token" };
  }

  const ctx = readEmbedContextCookie(req);
  if (ctx && (ctx.fileId !== fileId || ctx.tokenId !== row.id)) {
    return { ok: false, status: 403, error: "Domain not allowed" };
  }

  if (!isWildcardAllowedDomains(row.allowed_domains)) {
    if (!hasSignal) {
      return { ok: false, status: 403, error: "Domain not allowed" };
    }
    const hostForAllowlist =
      embeddingHost || captureEmbeddingHostForSession(req);
    if (!isHostInAllowedList(hostForAllowlist, row.allowed_domains)) {
      return { ok: false, status: 403, error: "Domain not allowed" };
    }
  }

  return {
    ok: true,
    row,
    embeddingHost: embeddingHost || captureEmbeddingHostForSession(req) || "",
  };
}

/**
 * Express middleware factory — attaches `req.embedAccess` on success.
 */
export function createRequireEmbedAccess({ lookupToken, requireFileId = false }) {
  return function requireEmbedAccess(req, res, next) {
    const fileId = requireFileId ? req.params.fileId : getEmbedRequestFileId(req);

    if (!fileId || typeof fileId !== "string") {
      return res.status(403).type("text/plain").send("Forbidden");
    }

    const token = getEmbedRequestToken(req);
    const result = validateEmbedAccess(req, {
      fileId,
      token,
      lookupToken,
    });

    if (!result.ok) {
      const wantsJson =
        req.path.includes("/api/") ||
        req.get("accept")?.includes("application/json");
      if (wantsJson) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.status(result.status).type("text/plain").send(result.error);
    }

    req.embedAccess = result;
    next();
  };
}

/**
 * @typedef {{ ok: true, ctx: { tokenId: string, fileId: string, embeddingHost: string, exp: number }, token: string }} EmbedSessionOk
 * @typedef {{ ok: false, status: number, error: string }} EmbedSessionFail
 */

/**
 * Content-hashed MindMap iframe chunks under /embed/mind-map/dist/.
 * Served without session gate (same policy as /embed/assets); document data stays token-gated.
 */
export function isEmbeddableHashedAssetPath(assetPath) {
  if (!assetPath || typeof assetPath !== "string") {
    return false;
  }
  return assetPath.startsWith("dist/");
}

/**
 * Vite embed entry chunks under /embed/assets/ and /embed/fonts/.
 * Dynamic import() does not send embed cookies reliably; filenames are content-hashed.
 */
export function isPublicEmbedHashedAssetPath(assetPath) {
  if (!assetPath || typeof assetPath !== "string") {
    return false;
  }
  return /-[a-zA-Z0-9_-]{6,}\.(?:js|css|mjs)$/i.test(assetPath);
}

/**
 * Validate signed session cookies issued after a successful embed page load.
 * Falls back to token + embed-page Referer when cookies are blocked (ITP / third-party).
 * @returns {EmbedSessionOk | EmbedSessionFail}
 */
export function validateEmbedSession(req, { lookupToken } = {}) {
  const cookieToken = getEmbedTokenCookie(req);
  const ctx = readEmbedContextCookie(req);
  if (ctx && cookieToken) {
    return { ok: true, ctx, token: String(cookieToken) };
  }

  if (typeof lookupToken === "function") {
    const token = getEmbedRequestToken(req);
    const fileId = ctx?.fileId || getEmbedRequestFileId(req);
    if (token && fileId) {
      const access = validateEmbedAccess(req, {
        fileId,
        token,
        lookupToken,
      });
      if (access.ok) {
        return {
          ok: true,
          ctx: ctx ?? {
            tokenId: access.row.id,
            fileId,
            embeddingHost: access.embeddingHost,
            exp: Date.now() + EMBED_COOKIE_MAX_AGE_SEC * 1000,
          },
          token: String(token),
        };
      }
    }
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

export function setPublicImmutableCacheHeaders(res) {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function setPrivateImmutableCacheHeaders(res) {
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

/**
 * Express middleware — hashed /embed static (assets, fonts, mind-map/dist).
 */
export function createRequireEmbedSession({ lookupToken } = {}) {
  return function requireEmbedSession(req, res, next) {
    const result = validateEmbedSession(req, { lookupToken });
    if (!result.ok) {
      return res.status(result.status).type("text/plain").send(result.error);
    }
    req.embedSession = result;
    next();
  };
}

/**
 * mind-map: dist/* uses session; index.html uses full document access.
 */
export function createMindMapEmbedGate({ lookupToken }) {
  const requireDocument = createRequireEmbedAccess({ lookupToken });

  return function mindMapEmbedGate(req, res, next) {
    const assetPath = (() => {
      try {
        return decodeURIComponent(req.path.replace(/^\/+/, "")) || "index.html";
      } catch {
        return null;
      }
    })();
    if (assetPath && isEmbeddableHashedAssetPath(assetPath)) {
      return next();
    }
    return requireDocument(req, res, next);
  };
}

export function isSameOriginAdminRequest(req) {
  const targetHost = getRequestHost(req);
  if (!targetHost) {
    return false;
  }
  const origin = req.get("origin");
  if (origin) {
    try {
      if (normalizeHost(new URL(origin).hostname) === targetHost) {
        return true;
      }
    } catch {
      // fall through
    }
  }
  const refererHost = hostFromReferer(req);
  return !!refererHost && refererHost === targetHost;
}
