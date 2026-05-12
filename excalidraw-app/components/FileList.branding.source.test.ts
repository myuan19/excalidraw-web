import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

describe("File list branding source contract", () => {
  it("uses neutral home branding instead of Excalidraw-only branding", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");
    const htmlSource = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
    const viteSource = fs.readFileSync(path.join(appRoot, "vite.config.mts"), "utf8");

    expect(source).toContain('const HOME_APP_TITLE = "可视化文档私有部署"');
    expect(source).toContain('<Icon type="home" size={22} />');
    expect(source).toContain("filelist__title\">{HOME_APP_TITLE}</h1>");
    expect(htmlSource).toContain("<title>可视化文档私有部署</title>");
    expect(viteSource).toContain('short_name: "可视化文档私有部署"');
    expect(viteSource).toContain('name: "可视化文档私有部署"');
    expect(source).not.toContain("Excalidraw 私有部署");
  });

  it("does not show document type badges in file cards", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");

    expect(source).not.toContain("const DOCUMENT_KIND_LABELS");
    expect(source).not.toContain('excalidraw: "EXCALIDRAW"');
    expect(source).not.toContain('mindmap: "MINDMAP"');
    expect(source).not.toContain("DOCUMENT_KIND_LABELS[kind]");
  });

  it("sets editor browser titles to their own document type names", () => {
    const excalidrawSource = fs.readFileSync(
      path.join(appRoot, "EditorShell.tsx"),
      "utf8",
    );
    const mindMapSource = fs.readFileSync(
      path.join(appRoot, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(excalidrawSource).toContain('document.title = "Excalidraw 画布"');
    expect(mindMapSource).toContain('document.title = "MindMap 思维导图"');
    expect(mindMapSource).toContain('title="MindMap 思维导图"');
  });
});
