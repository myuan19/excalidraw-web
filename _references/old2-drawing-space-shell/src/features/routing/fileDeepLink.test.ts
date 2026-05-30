import { describe, expect, it } from "vitest";
import { buildFileDeepLink, getFileIdFromLocation } from "./fileDeepLink";

describe("fileDeepLink", () => {
  it("reads file id from search params", () => {
    const location = {
      search: "?file=abc-123&kind=excalidraw",
      hash: "",
      pathname: "/",
    } as Location;
    expect(getFileIdFromLocation(location)).toBe("abc-123");
  });

  it("reads file id from hash params", () => {
    const location = {
      search: "",
      hash: "#file=legacy-id",
      pathname: "/",
    } as Location;
    expect(getFileIdFromLocation(location)).toBe("legacy-id");
  });

  it("builds deep links with kind", () => {
    const link = buildFileDeepLink("file-1", "mindmap");
    expect(link).toContain("file=file-1");
    expect(link).toContain("kind=mindmap");
  });
});
