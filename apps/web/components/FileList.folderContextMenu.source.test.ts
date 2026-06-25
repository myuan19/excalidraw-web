import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList folder context menu source contract", () => {
  it("uses a right-click menu for sidebar folder actions", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );
    const renderFolderTree = source.slice(
      source.indexOf("const renderFolderTree ="),
      source.indexOf("const toggleAllFilesTree ="),
    );

    expect(source).toContain("folderContextMenu");
    expect(source).toContain("openFolderContextMenu");
    expect(source).toContain("renderFolderContextMenu()");
    expect(renderFolderTree).toContain("onContextMenu={(e) =>");
    expect(renderFolderTree).not.toContain('title="重命名文件夹"');
    expect(renderFolderTree).not.toContain('title="删除文件夹"');
    expect(renderFolderTree).not.toContain('className="filelist__tree-action"');
    expect(source).toContain("打开本地文件夹");
  });
});
