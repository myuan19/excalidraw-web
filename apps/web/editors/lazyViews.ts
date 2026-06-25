import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { EditorPlugin } from "./types";

const embedViewerCache = new Map<
  string,
  LazyExoticComponent<ComponentType<any>>
>();

export function getLazyEmbedViewer(
  plugin: EditorPlugin | null,
): LazyExoticComponent<ComponentType<any>> | null {
  if (!plugin?.loadEmbedViewer) {
    return null;
  }
  const cached = embedViewerCache.get(plugin.kind);
  if (cached) {
    return cached;
  }
  const LazyViewer = lazy(plugin.loadEmbedViewer);
  embedViewerCache.set(plugin.kind, LazyViewer);
  return LazyViewer;
}

const editorShellCache = new Map<
  string,
  LazyExoticComponent<ComponentType<any>>
>();

export function getLazyEditorShell(
  plugin: EditorPlugin | null,
): LazyExoticComponent<ComponentType<any>> | null {
  if (!plugin) {
    return null;
  }
  const cached = editorShellCache.get(plugin.kind);
  if (cached) {
    return cached;
  }
  const LazyShell = lazy(plugin.loadEditorShell);
  editorShellCache.set(plugin.kind, LazyShell);
  return LazyShell;
}
