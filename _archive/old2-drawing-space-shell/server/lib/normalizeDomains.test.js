import { describe, expect, it } from "vitest";
import { normalizeDomains } from "./normalizeDomains.js";

describe("normalizeDomains", () => {
  it("accepts wildcard", () => {
    expect(normalizeDomains("*")).toBe("*");
    expect(normalizeDomains("  *  ")).toBe("*");
  });

  it("normalizes and dedupes hostnames", () => {
    expect(normalizeDomains("Example.COM, example.com")).toBe("example.com");
  });

  it("rejects invalid hostnames", () => {
    expect(normalizeDomains("not a host")).toBe(null);
  });

  it("treats empty input as wildcard", () => {
    expect(normalizeDomains("")).toBe("*");
  });
});
