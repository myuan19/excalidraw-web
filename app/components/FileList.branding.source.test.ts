import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const controllerPath = path.join(appRoot, "hooks/useFileListController.tsx");

describe("File list branding source contract", () => {
  it("uses drawing space home branding and app icon", () => {
    const brandingSource = fs.readFileSync(
      path.join(appRoot, "lib/appBranding.ts"),
      "utf8",
    );
    const source = fs.readFileSync(controllerPath, "utf8");
    const htmlSource = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
    const viteSource = fs.readFileSync(path.join(appRoot, "vite.config.mts"), "utf8");

    expect(brandingSource).toContain('export const HOME_APP_TITLE = "绘图空间"');
    expect(brandingSource).toContain('export const MAIN_SITE_ICON = "/icons/drawing-space.svg"');
    expect(source).toContain("applyMainSiteDocumentBranding");
    expect(source).toContain("HOME_APP_TITLE");
    expect(source).toContain(
      '<h1 className="filelist__title">{HOME_APP_TITLE}</h1>',
    );
    expect(htmlSource).toContain("<title>绘图空间</title>");
    expect(htmlSource).toContain('href="/icons/drawing-space.svg"');
    expect(htmlSource).toContain('content="绘图空间"');
    expect(htmlSource).toContain('content="统一管理 excalidraw 与 mindmap。"');
    expect(viteSource).toContain('short_name: "绘图空间"');
    expect(viteSource).toContain('name: "绘图空间"');
    expect(viteSource).toContain('"统一管理 excalidraw 与 mindmap。"');
    expect(source).not.toContain("可视化文档私有部署");
    expect(source).not.toContain("Excalidraw 私有部署");
  });

  it("uses editor registry icons and display names for document kinds", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("editorRegistry.getByKind(newDocumentKind)");
    expect(source).toContain("plugin.displayName");
    expect(source).toContain("listCreatable()");
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

  it("uses main site document branding inside editor shells", () => {
    const excalidrawSource = fs.readFileSync(
      path.join(appRoot, "editors/excalidraw/EditorShell.tsx"),
      "utf8",
    );
    const mindMapSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(excalidrawSource).toContain("useMainSiteDocumentBranding");
    expect(mindMapSource).toContain("useMainSiteDocumentBranding");
    expect(excalidrawSource).not.toContain('document.title = "excalidraw"');
    expect(mindMapSource).not.toContain('document.title = "mindmap"');
  });

  it("uses per-editor icons in the new-file dialog", () => {
    const source = fs.readFileSync(controllerPath, "utf8");

    expect(source).toContain("plugin.icon");
    expect(source).toContain("editorRegistry.getByKind(newDocumentKind)");
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
