import type { ComponentType } from "react";

import type { DocumentFormatAdapter } from "../data/formats/types";

/** Context passed when the file list creates a blank document. */
export interface EditorCreateFileContext {
  name: string;
  folderId: string | null;
}

/** Context passed when the file list imports an uploaded file. */
export interface EditorImportFileContext {
  file: File;
  fileName: string;
  folderId: string | null;
}

/**
 * Host-facing plugin contract for a document editor.
 *
 * Keep editor-specific complexity inside each `editors/<kind>/` folder.
 * The app shell only needs this metadata + optional hooks.
 */
export interface EditorPlugin {
  kind: string;
  displayName: string;
  /** Icon URL for file-list UI (e.g. `/icons/excalidraw.svg`). */
  icon: string;
  /** Used when the URL hash omits `?kind=`. At most one plugin should set this. */
  isDefault?: boolean;
  /** Warm the editor chunk after the file list finishes its first load. */
  prefetchOnFileListReady?: boolean;
  /** Omit `kind` in `#file=` hashes when opening this editor. */
  omitKindInHash?: boolean;

  adapter: DocumentFormatAdapter;

  loadEditorShell: () => Promise<{ default: ComponentType }>;
  loadEmbedViewer?: () => Promise<{ default: ComponentType<any> }>;

  /** Primary download extension without dot; defaults to the first adapter extension. */
  downloadExtension?: string;

  /** Create a server file with initial payload (required for “New file” UI). */
  createFile?: (ctx: EditorCreateFileContext) => Promise<{ id: string }>;

  /** Import an uploaded file (required for drag/drop import of this kind). */
  importFile?: (ctx: EditorImportFileContext) => Promise<{ id: string }>;

  /** Normalize stored/raw payload before handing to the embed viewer. */
  prepareEmbedData?: (raw: unknown) => unknown;

  /** Optional transform for readonly embed runtimes (e.g. iframe bridge payload). */
  buildEmbedPayload?: (data: unknown) => unknown;

  /** Extra import MIME types beyond `adapter.mimeTypes`. */
  importMimeTypes?: string[];
}

/** @deprecated Use EditorPlugin */
export type EditorDefinition = Pick<
  EditorPlugin,
  "kind" | "displayName" | "loadEditorShell"
> & {
  supportedExtensions: string[];
  loadComponent: EditorPlugin["loadEditorShell"];
};
