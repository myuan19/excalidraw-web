import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList rename interaction source contract", () => {
  it("suppresses the card open click when a rename interaction starts", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );
    const renderFileCard = source.slice(
      source.indexOf("const renderFileCard ="),
      source.indexOf("const empty = !loading"),
    );

    expect(source).toContain("suppressNextCardOpenRef");
    expect(renderFileCard).toContain("consumeSuppressedCardOpen(f.id)");
    expect(renderFileCard).toContain("onPointerDown={() => suppressNextCardOpen(f.id)}");
    expect(renderFileCard).toContain(
      "onPointerDown={(e) => {\n                  e.stopPropagation();\n                  suppressNextCardOpen(f.id);",
    );
  });

  it("shows the local-directory move action in the action row right after rename, not in recent view", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );
    const renderFileCard = source.slice(
      source.indexOf("const renderFileCard ="),
      source.indexOf("const showNewEntryCard"),
    );

    expect(renderFileCard).toContain("canMoveFileBetweenFolders");
    expect(renderFileCard).toContain("!isRecentView");
    expect(renderFileCard).toContain("catalogCapabilities.folderMapping");
    expect(renderFileCard).toContain('title="移动位置"');
    expect(renderFileCard).toContain("setMoveDialogFile(f)");
    expect(renderFileCard).toContain("setMoveTargetFolderId(f.folder_id ?? null)");
    // Move sits in the card action row directly after rename, before the body.
    expect(renderFileCard.indexOf('title="重命名"')).toBeLessThan(
      renderFileCard.indexOf('title="移动位置"'),
    );
    expect(renderFileCard.indexOf('title="移动位置"')).toBeLessThan(
      renderFileCard.indexOf("filelist__card-name-row"),
    );
  });

  it("move dialog reuses a collapsible folder tree that expands one level at a time", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain("moveDialogExpandedFolders");

    const moveTree = source.slice(
      source.indexOf("const renderMoveTargetFolderTree ="),
      source.indexOf("const fileListToasts"),
    );

    expect(moveTree).toContain("filelist__move-tree-toggle");
    expect(moveTree).toContain("filelist__move-tree-chevron");
    expect(moveTree).toContain("setMoveDialogExpandedFolders");
    // Children render only when expanded, so deep trees stay cheap until opened.
    expect(moveTree).toContain("expanded && hasChildren");
  });
});
