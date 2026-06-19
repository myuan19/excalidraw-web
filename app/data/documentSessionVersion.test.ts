import { describe, expect, it, vi } from "vitest";

import {
  compareDocumentVersions,
  DOCUMENT_VERSION_MAX,
  getDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";

describe("compareDocumentVersions", () => {
  it("orders nearby versions by the shorter clockwise distance", () => {
    expect(compareDocumentVersions(4, 3)).toBe("newer");
    expect(compareDocumentVersions(3, 4)).toBe("older");
  });

  it("treats wrap-around increments as newer", () => {
    expect(compareDocumentVersions(0, DOCUMENT_VERSION_MAX)).toBe("newer");
    expect(compareDocumentVersions(DOCUMENT_VERSION_MAX, 0)).toBe("older");
  });

  it("marks exactly half-circle distance as ambiguous", () => {
    expect(compareDocumentVersions(0, 1_073_741_824)).toBe("ambiguous");
  });
});

describe("session version logging", () => {
  it("logs session-set through unified docVersion outlet", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules();
    try {
      const sessionVersionModule = await import("./documentSessionVersion");
      sessionVersionModule.setDocumentSessionVersion("file-test-id", 3, {
        reason: "test-init",
      });
      sessionVersionModule.setDocumentSessionVersion("file-test-id", 5, {
        reason: "test-bump",
      });
      expect(
        sessionVersionModule.getDocumentSessionVersion("file-test-id"),
      ).toBe(5);
      expect(
        info.mock.calls.some((call) =>
          String(call[0]).includes("docVersion.log - session-set"),
        ),
      ).toBe(true);
    } finally {
      info.mockRestore();
    }
  });
});
