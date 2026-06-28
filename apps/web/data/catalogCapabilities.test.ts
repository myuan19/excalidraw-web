import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DESKTOP_CATALOG_CAPABILITIES,
  WEB_CATALOG_CAPABILITIES,
  parseCatalogCapabilities,
  resolveRuntimeCatalogCapabilities,
} from "./catalogCapabilities";

vi.mock("../lib/runtimePlatform", () => ({
  isDesktopEditorHub: vi.fn(() => false),
}));

import { isDesktopEditorHub } from "../lib/runtimePlatform";

describe("catalogCapabilities", () => {
  afterEach(() => {
    vi.mocked(isDesktopEditorHub).mockReturnValue(false);
  });

  it("falls back to web defaults when capabilities are missing", () => {
    expect(parseCatalogCapabilities(undefined)).toEqual(WEB_CATALOG_CAPABILITIES);
  });

  it("uses desktop defaults on desktop when capabilities are missing", () => {
    vi.mocked(isDesktopEditorHub).mockReturnValue(true);
    expect(resolveRuntimeCatalogCapabilities(undefined)).toEqual(
      DESKTOP_CATALOG_CAPABILITIES,
    );
  });

  it("honors explicit capability flags when present", () => {
    vi.mocked(isDesktopEditorHub).mockReturnValue(true);
    expect(
      resolveRuntimeCatalogCapabilities({
        folderMapping: false,
        addMappedFolder: false,
        archivesEnabled: true,
      }),
    ).toEqual({
      folderMapping: false,
      addMappedFolder: false,
      archivesEnabled: true,
    });
  });
});
