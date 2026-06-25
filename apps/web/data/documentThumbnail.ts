import { editorRegistry } from "../editors/registry";

import { buildExcalidrawSceneThumbnailSvg } from "./excalidrawSceneThumbnail";
import { normalizeDocument } from "./documentTypes";
import {
  LocalThumbnailCache,
  type LocalThumbnailMeta,
} from "./localThumbnailCache";
import {
  sanitizeThumbnailSvg,
  viewBackgroundFromSceneAppState,
  withFileListThumbnailAttrs,
} from "./thumbnailSvg";

export type DocumentThumbnailResult = {
  kind: string;
  thumbnailSvg: string | null;
};

export async function buildDocumentThumbnailSvg(opts: {
  kind?: string | null;
  data: unknown;
}): Promise<DocumentThumbnailResult> {
  const document = normalizeDocument(opts.data);
  const kind = editorRegistry.resolveKind(document?.kind ?? opts.kind);
  const data = document?.data ?? opts.data;

  if (kind === "mindmap") {
    return { kind, thumbnailSvg: null };
  }

  if (kind === "excalidraw") {
    const scene = data as {
      elements?: unknown;
      appState?: unknown;
      files?: unknown;
    };
    if (!Array.isArray(scene.elements) || scene.elements.length === 0) {
      const bg = viewBackgroundFromSceneAppState(scene.appState);
      return {
        kind,
        thumbnailSvg: withFileListThumbnailAttrs(
          `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="${bg.replace(/"/g, "&quot;")}"/></svg>`,
          bg,
        ),
      };
    }
    const rawSvg = await buildExcalidrawSceneThumbnailSvg({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    });
    const bg = viewBackgroundFromSceneAppState(scene.appState);
    return {
      kind,
      thumbnailSvg: withFileListThumbnailAttrs(sanitizeThumbnailSvg(rawSvg), bg),
    };
  }

  return { kind, thumbnailSvg: null };
}

export async function generateDocumentThumbnailAndCache(
  fileId: string,
  opts: {
    kind?: string | null;
    data: unknown;
  },
  cacheMeta?: Partial<LocalThumbnailMeta>,
): Promise<string | undefined> {
  try {
    const { thumbnailSvg } = await buildDocumentThumbnailSvg(opts);
    if (!thumbnailSvg) {
      return undefined;
    }
    LocalThumbnailCache.set(fileId, thumbnailSvg, cacheMeta);
    return thumbnailSvg;
  } catch {
    return undefined;
  }
}
