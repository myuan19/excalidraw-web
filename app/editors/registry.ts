import type { EditorPlugin } from "./types";

export function createEditorRegistry(plugins: EditorPlugin[]) {
  const byKind = new Map<string, EditorPlugin>();
  const byExtension = new Map<string, EditorPlugin>();

  for (const plugin of plugins) {
    byKind.set(plugin.kind, plugin);
    for (const extension of plugin.adapter.extensions) {
      byExtension.set(extension.toLowerCase(), plugin);
    }
  }

  const defaultPlugin =
    plugins.find((plugin) => plugin.isDefault) ?? plugins[0] ?? null;

  return {
    getByKind(kind: string): EditorPlugin | null {
      return byKind.get(kind) ?? null;
    },

    getByExtension(extension: string): EditorPlugin | null {
      return byExtension.get(extension.toLowerCase()) ?? null;
    },

    list(): EditorPlugin[] {
      return Array.from(byKind.values());
    },

    getDefaultKind(): string {
      return defaultPlugin?.kind ?? "excalidraw";
    },

    getDefaultPlugin(): EditorPlugin | null {
      return defaultPlugin;
    },

    /** Plugins that expose create/import hooks for the file list. */
    listCreatable(): EditorPlugin[] {
      return plugins.filter((plugin) => typeof plugin.createFile === "function");
    },

    resolveKind(kind: string | null | undefined): string {
      if (kind && byKind.has(kind)) {
        return kind;
      }
      return this.getDefaultKind();
    },

    buildFileHash(fileId: string, kind?: string | null): string {
      const resolved = this.resolveKind(kind);
      const params = new URLSearchParams();
      params.set("file", fileId);
      if (resolved !== defaultPlugin?.kind) {
        params.set("kind", resolved);
      }
      return `#${params.toString()}`;
    },

    /** Open a blank editor session without creating a server or local temp file. */
    buildNewDocumentHash(kind?: string | null): string {
      const resolved = this.resolveKind(kind);
      const params = new URLSearchParams();
      params.set("new", "1");
      if (resolved !== defaultPlugin?.kind) {
        params.set("kind", resolved);
      }
      return `#${params.toString()}`;
    },

    buildEmbedEditUrl(
      fileId: string | undefined,
      kind: string,
      origin = typeof window !== "undefined" ? window.location.origin : "",
    ): string {
      if (!fileId) {
        return origin;
      }
      const resolved = this.resolveKind(kind);
      const params = new URLSearchParams();
      params.set("file", fileId);
      if (resolved !== defaultPlugin?.kind) {
        params.set("kind", resolved);
      }
      return `${origin}/#${params.toString()}`;
    },

    getDownloadExtension(kind: string): string {
      if (kind === "text") {
        return "txt";
      }
      const plugin = byKind.get(kind);
      if (plugin?.downloadExtension) {
        return plugin.downloadExtension;
      }
      const ext = plugin?.adapter.extensions[0];
      return ext?.replace(/^\./, "") ?? "json";
    },

    /** HTML file input `accept` attribute for document import. */
    buildImportAccept(): string {
      const extensions = new Set<string>();
      const mimeTypes = new Set<string>();
      for (const plugin of plugins) {
        if (!plugin.importFile) {
          continue;
        }
        for (const ext of plugin.adapter.extensions) {
          extensions.add(ext);
        }
        for (const mime of plugin.adapter.mimeTypes) {
          mimeTypes.add(mime);
        }
        for (const mime of plugin.importMimeTypes ?? []) {
          mimeTypes.add(mime);
        }
      }
      extensions.add(".excalidrawlib");
      extensions.add(".txt");
      extensions.add(".json");
      extensions.add(".png");
      extensions.add(".svg");
      extensions.add(".jpe?g");
      mimeTypes.add("application/json");
      mimeTypes.add("text/plain");
      mimeTypes.add("image/png");
      mimeTypes.add("image/svg+xml");
      mimeTypes.add("image/jpeg");
      return [...extensions, ...mimeTypes].join(",");
    },

    /** Human-readable editor names for import error messages. */
    importableEditorNames(): string {
      return plugins
        .filter((plugin) => plugin.importFile)
        .map((plugin) => plugin.displayName)
        .join(" / ");
    },

    prefetchOnFileListReady(): void {
      for (const plugin of plugins) {
        if (plugin.prefetchOnFileListReady) {
          plugin.loadEditorShell().catch(() => {});
        }
      }
    },
  };
}

import { excalidrawPlugin } from "./excalidraw";
import { mindMapPlugin } from "./mindmap";

export const editorRegistry = createEditorRegistry([
  excalidrawPlugin,
  mindMapPlugin,
]);
