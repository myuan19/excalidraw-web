import { useEffect } from "react";

import { editorRegistry } from "../editors";
import { createLogger } from "./logger";

/**
 * 品牌分层：
 * - 浏览器标签标题：文件列表为主站名；打开具体文件时为文件名；favicon 始终主站
 * - 侧边栏悬浮球、新建文件类型：各编辑器 `EditorPlugin.icon`
 * - 文件列表顶栏、文件卡片：主站标题 + `editorIconForKind`
 */
export const HOME_APP_TITLE = "EditorHub";
export const MAIN_SITE_ICON = "/icons/drawing-space.svg";

const logBranding = createLogger({ module: "branding" });

export function getDocumentKindFromHash(hash?: string): string {
  const rawHash =
    hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const params = new URLSearchParams(rawHash.replace(/^#/, ""));
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

function currentHashForLog(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

/** 将当前文档的标签标题与 favicon 设为主站品牌。 */
export function applyMainSiteDocumentBranding(): void {
  const previousTitle = document.title;
  document.title = HOME_APP_TITLE;
  for (const link of collectFaviconLinks()) {
    link.href = MAIN_SITE_ICON;
  }
  logBranding.event("info", "branding.title.apply", "document title applied", {
    fields: {
      scope: "main",
      previousTitle,
      nextTitle: HOME_APP_TITLE,
      hash: currentHashForLog(),
    },
  });
}

/** 打开文件时的标签标题；无有效文件名时回退主站名。 */
export function resolveEditorDocumentTitle(
  fileName: string | null | undefined,
): string {
  const trimmed = fileName?.trim();
  return trimmed ? trimmed : HOME_APP_TITLE;
}

/** 编辑器标签：有文件名则用文件名，favicon 仍为主站。 */
export function applyEditorDocumentBranding(
  fileName: string | null | undefined,
): void {
  const previousTitle = document.title;
  const nextTitle = resolveEditorDocumentTitle(fileName);
  document.title = nextTitle;
  for (const link of collectFaviconLinks()) {
    link.href = MAIN_SITE_ICON;
  }
  logBranding.event("info", "branding.title.apply", "document title applied", {
    fields: {
      scope: "editor",
      fileName: fileName?.trim() || null,
      previousTitle,
      nextTitle,
      hash: currentHashForLog(),
    },
  });
}

/**
 * 编辑器会话内同步标签标题（文件名）与主站 favicon。
 */
export function useEditorDocumentTitle(
  fileName: string | null | undefined,
): void {
  useEffect(() => {
    const prevTitle = document.title;
    const iconLinks = collectFaviconLinks();
    const prevHrefs = new Map(iconLinks.map((link) => [link, link.href]));

    applyEditorDocumentBranding(fileName);

    return () => {
      document.title = prevTitle;
      for (const [link, href] of prevHrefs) {
        link.href = href;
      }
      logBranding.event(
        "info",
        "branding.title.restore",
        "document title restored",
        {
          fields: {
            scope: "editor",
            fileName: fileName?.trim() || null,
            restoredTitle: prevTitle,
            hash: currentHashForLog(),
          },
        },
      );
    };
  }, [fileName]);
}
