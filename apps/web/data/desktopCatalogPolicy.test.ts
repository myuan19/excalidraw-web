import { describe, expect, it } from "vitest";

import {
  DESKTOP_CATALOG_PASS_STAT_ONLY,
  deriveCatalogScanNoticeForRuntime,
  deriveDesktopCatalogScanNotice,
  findDefaultDataDirectoryFolderId,
} from "./desktopCatalogPolicy";
import type { FileTreeResponse } from "./ServerSync";

describe("desktopCatalogPolicy", () => {
  it("silences stat-only scan when no pending files", () => {
    expect(
      deriveDesktopCatalogScanNotice({
        state: "running",
        running: true,
        pass: DESKTOP_CATALOG_PASS_STAT_ONLY,
      }),
    ).toBeNull();
    expect(
      deriveDesktopCatalogScanNotice(
        {
          state: "running",
          running: true,
          pass: DESKTOP_CATALOG_PASS_STAT_ONLY,
        },
        {
          folders: [],
          files: [{ id: "a", name: "a", created_at: "1", updated_at: "1", scan_pending: true }],
        } as FileTreeResponse,
      ),
    ).toContain("校验");
  });

  it("shows indexing notice for non-stat-only running scan", () => {
    expect(
      deriveDesktopCatalogScanNotice({
        state: "running",
        running: true,
        pass: "pending-only",
      }),
    ).toContain("索引");
  });

  it("web runtime keeps generic running notice", () => {
    expect(
      deriveCatalogScanNoticeForRuntime(
        { state: "running", running: true, pass: DESKTOP_CATALOG_PASS_STAT_ONLY },
        null,
        false,
      ),
    ).toContain("索引");
  });

  it("findDefaultDataDirectoryFolderId matches mapping root basename", () => {
    const id = findDefaultDataDirectoryFolderId(
      [
        {
          id: "root-1",
          name: "EditorHub",
          created_at: "1",
          updated_at: "1",
          is_mapping_root: true,
        },
      ],
      "C:\\Users\\me\\Documents\\EditorHub",
    );
    expect(id).toBe("root-1");
  });
});
