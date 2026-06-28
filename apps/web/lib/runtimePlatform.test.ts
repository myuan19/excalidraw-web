import { afterEach, describe, expect, it } from "vitest";

import { isDesktopEditorHub, canOpenRecentByCatalogPath } from "./runtimePlatform";

describe("isDesktopEditorHub", () => {
  afterEach(() => {
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 test",
      configurable: true,
    });
  });

  it("returns true when preload injected editorHubDesktop", () => {
    window.editorHubDesktop = { platform: "win32" };
    expect(isDesktopEditorHub()).toBe(true);
  });

  it("returns true when UA contains EditorHub/", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 EditorHub/1.0.0",
      configurable: true,
    });
    expect(isDesktopEditorHub()).toBe(true);
  });

  it("returns false on normal web", () => {
    expect(isDesktopEditorHub()).toBe(false);
  });

  it("returns true for editorhub custom protocol", () => {
    const original = window.location.protocol;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, protocol: "editorhub:" },
    });
    expect(isDesktopEditorHub()).toBe(true);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, protocol: original },
    });
  });
});

describe("canOpenRecentByCatalogPath", () => {
  afterEach(() => {
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
  });

  it("returns true when getPathForFile is exposed", () => {
    window.editorHubDesktop = {
      getPathForFile: () => "C:/demo.excalidraw",
    };
    expect(canOpenRecentByCatalogPath()).toBe(true);
  });

  it("returns false on plain web", () => {
    expect(canOpenRecentByCatalogPath()).toBe(false);
  });
});
