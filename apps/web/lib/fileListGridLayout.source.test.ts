import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.join(__dirname, "../components/FileList.scss");
const layoutPath = path.join(__dirname, "fileListGridLayout.ts");
const controllerPath = path.join(__dirname, "../hooks/useFileListController.tsx");

describe("fileListGridLayout source contract", () => {
  it("uses css auto-fill grid without virtual row markup", () => {
    const styles = fs.readFileSync(stylesPath, "utf8");

    expect(styles).toContain("grid-template-columns: repeat(");
    expect(styles).toContain("auto-fill");
    expect(styles).not.toContain("filelist__virtual-row");
    expect(styles).not.toContain("data-virtualized");
  });

  it("keeps scroll perf helpers for listed cell counts", () => {
    const layoutSource = fs.readFileSync(layoutPath, "utf8");
    const controllerSource = fs.readFileSync(controllerPath, "utf8");

    expect(layoutSource).toContain("computeFileListGridListedCellCount");
    expect(controllerSource).toContain("computeFileListGridListedCellCount");
    expect(controllerSource).toContain("filteredFiles.map");
    expect(controllerSource).not.toContain("FileListVirtualGrid");
  });
});
