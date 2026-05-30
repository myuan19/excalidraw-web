import { describe, expect, it } from "vitest";
import { computeFileListSidebarMinWidth } from "./computeFileListSidebarMinWidth";
import type { ServerFile, ServerFolder } from "@/types/file";

const folder = (id: string, name: string, parentId: string | null): ServerFolder => ({
  id,
  name,
  parent_id: parentId,
  sort_index: 0,
  created_at: "",
  updated_at: "",
});

describe("computeFileListSidebarMinWidth", () => {
  it("grows with nested folder name length", () => {
    const shallow = computeFileListSidebarMinWidth([
      folder("a", "短", null),
    ]);
    const deep = computeFileListSidebarMinWidth([
      folder("root", "根", null),
      folder("child", "非常非常非常非常长的子文件夹名称", "root"),
    ]);
    expect(deep).toBeGreaterThan(shallow);
  });

  it("considers file names when provided", () => {
    const without = computeFileListSidebarMinWidth([], []);
    const withLongFile = computeFileListSidebarMinWidth([], [{
      id: "f1",
      name: "超长文件名示意-项目路线图备份-final",
      kind: "mindmap",
      folder_id: null,
      created_at: "",
      updated_at: "",
      has_thumbnail: false,
      archive_count: 0,
      content_sha256: null,
    } satisfies ServerFile]);
    expect(withLongFile).toBeGreaterThanOrEqual(without);
  });
});
