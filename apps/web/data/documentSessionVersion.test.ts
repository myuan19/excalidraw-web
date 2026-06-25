import { describe, expect, it } from "vitest";

import {
  compareDocumentVersions,
  DOCUMENT_VERSION_MAX,
  getDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";

describe("compareDocumentVersions", () => {
  it("orders nearby versions by forward distance", () => {
    expect(compareDocumentVersions(4, 3)).toBe("newer");
    expect(compareDocumentVersions(3, 4)).toBe("older");
    expect(compareDocumentVersions(4, 4)).toBe("same");
  });

  it("treats wrap-around increments as newer", () => {
    expect(compareDocumentVersions(0, DOCUMENT_VERSION_MAX)).toBe("newer");
    expect(compareDocumentVersions(DOCUMENT_VERSION_MAX, 0)).toBe("older");
  });

  it("marks exactly half-circle distance as ambiguous", () => {
    expect(compareDocumentVersions(0, 1_073_741_824)).toBe("ambiguous");
  });
});

describe("document session version", () => {
  it("stores only valid integer versions", () => {
    const fileId = "session-version-file";

    setDocumentSessionVersion(fileId, 3, { reason: "test" });
    setDocumentSessionVersion(fileId, -1, { reason: "invalid" });
    setDocumentSessionVersion(fileId, 3.5, { reason: "invalid" });

    expect(getDocumentSessionVersion(fileId)).toBe(3);
  });

  it("does not regress when an older sidecar response arrives late", () => {
    const fileId = "session-version-late-sidecar";

    setDocumentSessionVersion(fileId, 8, { reason: "save-success" });
    setDocumentSessionVersion(fileId, 7, { reason: "thumbnail-save" });

    expect(getDocumentSessionVersion(fileId)).toBe(8);
  });
});
