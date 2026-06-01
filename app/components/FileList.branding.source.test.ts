import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const controllerPath = path.join(appRoot, "hooks/useFileListController.tsx");

describe("File list branding source contract", () => {
  it("uses EditorHub home branding and app icon", () => {
    const brandingSource = fs.readFileSync(
      path.join(appRoot, "lib/appBranding.ts"),
      "utf8",
    );
    const source = fs.readFileSync(controllerPath, "utf8");
    const htmlSource = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
    const viteSource = fs.readFileSync(path.join(appRoot, "vite.config.mts"), "utf8");

    expect(brandingSource).toContain('export const HOME_APP_TITLE = "EditorHub"');
    expect(brandingSource).toContain('export const MAIN_SITE_ICON = "/icons/drawing-space.svg"');
    expect(source).toContain("applyMainSiteDocumentBranding");
    expect(source).toContain("HOME_APP_TITLE");
    expect(source).toContain("filelist__sidebar-brand-title");
    expect(source).toContain("{HOME_APP_TITLE}");
    expect(source).toContain("MAIN_SITE_ICON");
    expect(htmlSource).toContain("<title>EditorHub</title>");
    expect(htmlSource).toContain('href="/icons/drawing-space.svg"');
    expect(htmlSource).toContain('content="EditorHub"');
    expect(htmlSource).toContain('content="统一管理多种编辑器与文档。"');
    expect(viteSource).toContain('short_name: "EditorHub"');
    expect(viteSource).toContain('name: "EditorHub"');
    expect(viteSource).toContain('"统一管理多种编辑器与文档。"');
    expect(source).not.toContain("可视化文档私有部署");
    expect(source).not.toContain("Excalidraw 私有部署");
  });

  it("uses editor registry icons and display names for document kinds", () => {
    const newFileSource = fs.readFileSync(
      path.join(appRoot, "components/NewFileDialog.tsx"),
      "utf8",
    );

    expect(newFileSource).toContain("listCreatable()");
    expect(newFileSource).toContain("plugin.icon");
    expect(newFileSource).toContain("plugin.displayName");
  });

  it("ships icon assets for the home app and both editors", () => {
    const publicRoot = path.resolve(appRoot, "../public");

    expect(fs.existsSync(path.join(publicRoot, "icons/drawing-space.svg"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(publicRoot, "icons/excalidraw.svg"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(publicRoot, "icons/mindmap.ico"))).toBe(true);
    expect(fs.existsSync(path.join(publicRoot, "mind-map/dist/logo.ico"))).toBe(
      true,
    );
  });

  it("does not show document type badges in file cards", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).not.toContain("const DOCUMENT_KIND_LABELS");
    expect(source).not.toContain('excalidraw: "EXCALIDRAW"');
    expect(source).not.toContain('mindmap: "MINDMAP"');
    expect(source).not.toContain("DOCUMENT_KIND_LABELS[kind]");
  });

  it("uses file name for document title inside editor shells", () => {
    const brandingSource = fs.readFileSync(
      path.join(appRoot, "lib/appBranding.ts"),
      "utf8",
    );
    const excalidrawSource = fs.readFileSync(
      path.join(appRoot, "editors/excalidraw/EditorShell.tsx"),
      "utf8",
    );
    const mindMapSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(brandingSource).toContain("useEditorDocumentTitle");
    expect(brandingSource).toContain("resolveEditorDocumentTitle");
    expect(excalidrawSource).toContain("useEditorDocumentTitle");
    expect(mindMapSource).toContain("useEditorDocumentTitle");
    expect(excalidrawSource).not.toContain('document.title = "excalidraw"');
    expect(mindMapSource).not.toContain('document.title = "mindmap"');
  });

  it("uses per-editor icons in the new-file dialog", () => {
    const newFileSource = fs.readFileSync(
      path.join(appRoot, "components/NewFileDialog.tsx"),
      "utf8",
    );

    expect(newFileSource).toContain("plugin.icon");
    expect(newFileSource).toContain("filelist__kind-option");
    expect(newFileSource).toContain("onClick={() => pickKind(plugin.kind)}");
  });

  it("uses per-editor icons on the floating sidebar ball", () => {
    const sidebarSource = fs.readFileSync(
      path.join(appRoot, "components/EditorPlatformSidebar.tsx"),
      "utf8",
    );

    expect(sidebarSource).toContain("editorIconForKind(documentKind)");
    expect(sidebarSource).toContain("ballIconSrc");
    expect(sidebarSource).not.toContain('src={DRAWING_SPACE_ICON}');
  });
});
