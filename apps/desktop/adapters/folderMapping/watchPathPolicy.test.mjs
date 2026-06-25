import { describe, expect, it } from "vitest";

import {
  isSidecarWatchPath,
  normalizeWatchPath,
  shouldScheduleRescanForWatchPath,
} from "./watchPathPolicy.js";

describe("watchPathPolicy", () => {
  it("normalizes Windows separators", () => {
    expect(normalizeWatchPath("a\\b\\c")).toBe("a/b/c");
  });

  it("ignores empty watch paths", () => {
    expect(shouldScheduleRescanForWatchPath("")).toBe(false);
    expect(shouldScheduleRescanForWatchPath(null)).toBe(false);
  });

  it("ignores sidecar and common noisy directories", () => {
    expect(isSidecarWatchPath(".editorhub/workspace.json")).toBe(true);
    expect(shouldScheduleRescanForWatchPath(".editorhub/thumbnails/x.svg")).toBe(
      false,
    );
    expect(
      shouldScheduleRescanForWatchPath("project/node_modules/pkg/index.js"),
    ).toBe(false);
    expect(shouldScheduleRescanForWatchPath("repo/.git/index")).toBe(false);
  });

  it("ignores non-document files such as QQ bubble zips", () => {
    expect(
      shouldScheduleRescanForWatchPath(
        "Tencent Files/nt_qq/global/nt_data/VasUpdateSystem/bubble/bubble.ios.2143199.static.zip",
      ),
    ).toBe(false);
  });

  it("accepts document files and extensionless directory paths", () => {
    expect(shouldScheduleRescanForWatchPath("notes/diagram.excalidraw")).toBe(
      true,
    );
    expect(shouldScheduleRescanForWatchPath("maps/root.smm")).toBe(true);
    expect(shouldScheduleRescanForWatchPath("MyFolder")).toBe(true);
    expect(shouldScheduleRescanForWatchPath("parent/NewFolder")).toBe(true);
  });
});
