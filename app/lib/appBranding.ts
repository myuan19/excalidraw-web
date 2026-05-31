import { useEffect } from "react";

import { editorRegistry } from "../editors";

/** 主站（文件列表 + 编辑器外壳）品牌 */
export const HOME_APP_TITLE = "绘图空间";
export const MAIN_SITE_ICON = "/icons/drawing-space.svg";

export function getDocumentKindFromHash(): string {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return editorRegistry.resolveKind(params.get("kind"));
}

/** 文件列表、新建对话框等按文档类型展示的图标 */
export function editorIconForKind(kind: string): string {
  return (
    editorRegistry.getByKind(kind)?.icon ??
    editorRegistry.getDefaultPlugin()?.icon ??
    MAIN_SITE_ICON
  );
}

function collectFaviconLinks(): HTMLLinkElement[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]',
    ),
  );
}

/**
 * 编辑器会话内：浏览器标签标题与 favicon 使用主站品牌（非 excalidraw/mindmap 子品牌）。
 */
export function useMainSiteDocumentBranding(): void {
  useEffect(() => {
    const prevTitle = document.title;
    const iconLinks = collectFaviconLinks();
    const prevHrefs = new Map(iconLinks.map((link) => [link, link.href]));

    document.title = HOME_APP_TITLE;
    for (const link of iconLinks) {
      link.href = MAIN_SITE_ICON;
    }

    return () => {
      document.title = prevTitle;
      for (const [link, href] of prevHrefs) {
        link.href = href;
      }
    };
  }, []);
}
