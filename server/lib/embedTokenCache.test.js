import { describe, expect, it, vi } from "vitest";
import {
  createEmbedTokenActiveCache,
} from "./embedTokenCache.js";

describe("embed token active cache", () => {
  it("reuses active token lookups within the ttl", () => {
    let now = 1000;
    const lookup = vi.fn(() => true);
    const cache = createEmbedTokenActiveCache({
      ttlMs: 100,
      now: () => now,
      lookup,
    });

    expect(cache.isActive("tok_1")).toBe(true);
    expect(cache.isActive("tok_1")).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);

    now += 101;
    expect(cache.isActive("tok_1")).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("does not cache inactive token lookups", () => {
    const lookup = vi.fn(() => false);
    const cache = createEmbedTokenActiveCache({
      ttlMs: 100,
      now: () => 1000,
      lookup,
    });

    expect(cache.isActive("tok_1")).toBe(false);
    expect(cache.isActive("tok_1")).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("clears cached entries explicitly", () => {
    const lookup = vi.fn(() => true);
    const cache = createEmbedTokenActiveCache({
      ttlMs: 100,
      now: () => 1000,
      lookup,
    });

    expect(cache.isActive("tok_1")).toBe(true);
    cache.clear("tok_1");
    expect(cache.isActive("tok_1")).toBe(true);

    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
