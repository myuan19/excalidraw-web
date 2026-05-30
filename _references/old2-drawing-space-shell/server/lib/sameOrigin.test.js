import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./sameOrigin.js";

function req(headers) {
  return {
    get(name) {
      return headers[name.toLowerCase()] ?? headers[name] ?? "";
    },
  };
}

describe("isSameOriginRequest", () => {
  it("accepts requests without an Origin header", () => {
    expect(isSameOriginRequest(req({ host: "example.test" }))).toBe(true);
  });

  it("accepts matching Origin and Host", () => {
    expect(isSameOriginRequest(req({
      host: "example.test",
      origin: "https://example.test",
    }))).toBe(true);
  });

  it("rejects cross-origin requests for protected API routes", () => {
    expect(isSameOriginRequest(req({
      host: "example.test",
      origin: "https://evil.test",
    }))).toBe(false);
  });
});
