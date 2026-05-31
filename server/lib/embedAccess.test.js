import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  buildEmbedContextCookieValue,
  captureEmbeddingHostForSession,
  getEmbedRequestToken,
  hasEmbeddingContextSignal,
  isHostInAllowedList,
  issueEmbedSessionCookies,
  normalizeHost,
  parseAllowedDomainsInput,
  readEmbedContextCookie,
  resolveEmbeddingHost,
  validateEmbedAccess,
} from "./embedAccess.js";

function mockReq({
  query = {},
  headers = {},
  params = { fileId: "file-1" },
} = {}) {
  return {
    query,
    params,
    path: "/embed/api/file-1/data",
    get(name) {
      const key = name.toLowerCase();
      if (key === "referer") {
        return headers.referer ?? "";
      }
      if (key === "origin") {
        return headers.origin ?? "";
      }
      if (key === "host") {
        return headers.host ?? "excalidraw.example.com";
      }
      if (key === "accept") {
        return headers.accept ?? "application/json";
      }
      return "";
    },
    headers: {
      cookie: headers.cookie ?? "",
      ...headers,
    },
  };
}

describe("embedAccess domain helpers", () => {
  it("parses allowed domain lists", () => {
    expect(parseAllowedDomainsInput("a.com, b.com")).toBe("a.com,b.com");
    expect(parseAllowedDomainsInput("*")).toBe("*");
    expect(parseAllowedDomainsInput("")).toBe("*");
  });

  it("matches subdomains in allowlist", () => {
    expect(isHostInAllowedList("app.partner.com", "partner.com")).toBe(true);
    expect(isHostInAllowedList("evil.com", "partner.com")).toBe(false);
    expect(isHostInAllowedList("evil.com", "*")).toBe(true);
  });
});

describe("validateEmbedAccess order and policy", () => {
  const lookupToken = vi.fn((token, fileId) => {
    if (token !== "tok-valid" || fileId !== "file-1") {
      return undefined;
    }
    return {
      id: "tid-1",
      token: "tok-valid",
      file_id: "file-1",
      allowed_domains: "partner.com",
    };
  });

  beforeEach(() => {
    process.env.EMBED_SESSION_SECRET = "test-secret";
    lookupToken.mockClear();
  });

  it("rejects restricted allowlist when there is no embedding context", () => {
    const result = validateEmbedAccess(
      mockReq({ query: { token: "tok-valid" } }),
      { fileId: "file-1", token: "tok-valid", lookupToken },
    );
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Domain not allowed",
    });
  });

  it("rejects missing token when referer present", () => {
    const result = validateEmbedAccess(
      mockReq({
        headers: { referer: "https://partner.com/page", host: "excalidraw.example.com" },
      }),
      { fileId: "file-1", token: null, lookupToken },
    );
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Missing embed token",
    });
  });

  it("rejects invalid token after referer context exists", () => {
    const result = validateEmbedAccess(
      mockReq({
        query: { token: "tok-wrong" },
        headers: { referer: "https://partner.com/page", host: "excalidraw.example.com" },
      }),
      { fileId: "file-1", token: "tok-wrong", lookupToken },
    );
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Invalid token",
    });
  });

  it("rejects disallowed parent host before token validity is irrelevant", () => {
    const result = validateEmbedAccess(
      mockReq({
        query: { token: "tok-valid" },
        headers: { referer: "https://evil.com/", host: "excalidraw.example.com" },
      }),
      { fileId: "file-1", token: "tok-valid", lookupToken },
    );
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Domain not allowed",
    });
  });

  it("allows partner iframe when token and host match", () => {
    const result = validateEmbedAccess(
      mockReq({
        query: { token: "tok-valid" },
        headers: { referer: "https://app.partner.com/", host: "excalidraw.example.com" },
      }),
      { fileId: "file-1", token: "tok-valid", lookupToken },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.embeddingHost).toBe("app.partner.com");
    }
  });

  it("allows wildcard token without referer (direct link)", () => {
    lookupToken.mockReturnValueOnce({
      id: "tid-2",
      token: "tok-valid",
      file_id: "file-1",
      allowed_domains: "*",
    });
    const result = validateEmbedAccess(
      mockReq({ query: { token: "tok-valid" } }),
      { fileId: "file-1", token: "tok-valid", lookupToken },
    );
    expect(result.ok).toBe(true);
  });

  it("uses signed context cookie for subresource requests", () => {
    const cookies = [];
    const res = {
      getHeader(name) {
        return name === "Set-Cookie" && cookies.length ? cookies : undefined;
      },
      setHeader(name, value) {
        if (name === "Set-Cookie") {
          cookies.push(...(Array.isArray(value) ? value : [value]));
        }
      },
    };
    issueEmbedSessionCookies(res, {
      token: "tok-valid",
      tokenId: "tid-1",
      fileId: "file-1",
      embeddingHost: "partner.com",
    });
    const ctxCookie = cookies.find((c) => c.startsWith("__embed_ctx="));
    expect(ctxCookie).toBeTruthy();

    const req = mockReq({
      query: { _t: "tok-valid" },
      headers: {
        cookie: cookies.map((c) => c.split(";")[0]).join("; "),
        host: "excalidraw.example.com",
        referer: "https://excalidraw.example.com/embed/file-1?token=tok-valid",
      },
    });
    expect(resolveEmbeddingHost(req)).toBe("partner.com");
    const result = validateEmbedAccess(req, {
      fileId: "file-1",
      token: "tok-valid",
      lookupToken,
    });
    expect(result.ok).toBe(true);
  });
});

describe("embed context cookie", () => {
  beforeEach(() => {
    process.env.EMBED_SESSION_SECRET = "test-secret";
  });

  it("round-trips signed payload", () => {
    const value = buildEmbedContextCookieValue({
      tokenId: "tid-1",
      fileId: "file-1",
      embeddingHost: "partner.com",
    });
    const req = mockReq({
      headers: { cookie: `__embed_ctx=${encodeURIComponent(value)}` },
    });
    const ctx = readEmbedContextCookie(req);
    expect(ctx).toMatchObject({
      tokenId: "tid-1",
      fileId: "file-1",
      embeddingHost: "partner.com",
    });
  });
});
