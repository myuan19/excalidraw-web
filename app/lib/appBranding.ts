import { useEffect } from "react";

import { editorRegistry } from "../editors";

/**
 * 品牌分层：
 * - 浏览器标签标题 / favicon：始终主站（本模块）
 * - 侧边栏悬浮球、新建文件类型：各编辑器 `EditorPlugin.icon`
 * - 文件列表顶栏、文件卡片：主站标题 + `editorIconForKind`
 */
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

/** 将当前文档的标签标题与 favicon 设为主站品牌。 */
export function applyMainSiteDocumentBranding(): void {
  document.title = HOME_APP_TITLE;
  for (const link of collectFaviconLinks()) {
    link.href = MAIN_SITE_ICON;
  }
}

/**
 * 编辑器会话内保持主站标签品牌（覆盖子编辑器可能改动的 title/favicon）。
 */
export function useMainSiteDocumentBranding(): void {
  useEffect(() => {
    const prevTitle = document.title;
    const iconLinks = collectFaviconLinks();
    const prevHrefs = new Map(iconLinks.map((link) => [link, link.href]));

    applyMainSiteDocumentBranding();

    return () => {
      document.title = prevTitle;
      for (const [link, href] of prevHrefs) {
        link.href = href;
      }
    };
  }, []);
}
