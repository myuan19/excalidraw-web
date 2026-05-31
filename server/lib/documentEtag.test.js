import { describe, expect, it } from "vitest";

import {
  formatDocumentEtag,
  ifNoneMatchSatisfied,
  parseIfNoneMatch,
} from "./documentEtag.js";

describe("documentEtag", () => {
  it("formats sha256 as quoted etag", () => {
    expect(formatDocumentEtag("abc123")).toBe('"abc123"');
    expect(formatDocumentEtag('"already"')).toBe('"already"');
  });

  it("parses If-None-Match including weak and star", () => {
    expect(parseIfNoneMatch('"a", W/"b", *')).toEqual(["a", "b", "*"]);
  });

  it("matches exact sha and wildcard", () => {
    expect(ifNoneMatchSatisfied('"deadbeef"', "deadbeef")).toBe(true);
    expect(ifNoneMatchSatisfied("deadbeef", "deadbeef")).toBe(true);
    expect(ifNoneMatchSatisfied("*", "deadbeef")).toBe(true);
    expect(ifNoneMatchSatisfied('"other"', "deadbeef")).toBe(false);
  });

  it("returns false when etag or sha missing", () => {
    expect(ifNoneMatchSatisfied("", "deadbeef")).toBe(false);
    expect(ifNoneMatchSatisfied('"deadbeef"', "")).toBe(false);
  });
});
