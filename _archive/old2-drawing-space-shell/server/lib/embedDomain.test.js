import { describe, expect, it } from "vitest";
import { isDomainAllowed } from "./embedDomain.js";

function mockReq(origin) {
  return {
    get(name) {
      if (name === "origin") return origin;
      return "";
    },
  };
}

describe("isDomainAllowed", () => {
  it("allows wildcard domains", () => {
    expect(isDomainAllowed("*", mockReq("https://evil.com"))).toBe(true);
  });

  it("rejects mismatched hostnames", () => {
    expect(isDomainAllowed("example.com", mockReq("https://evil.com"))).toBe(false);
  });

  it("allows exact hostname matches", () => {
    expect(isDomainAllowed("app.example.com", mockReq("https://app.example.com"))).toBe(true);
  });
});
