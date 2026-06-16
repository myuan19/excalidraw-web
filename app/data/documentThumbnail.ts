import { editorRegistry } from "../editors/registry";

import { normalizeDocument } from "./documentTypes";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { buildSceneThumbnailSvg } from "./thumbnailSvg";

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
    const svg = await buildSceneThumbnailSvg({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    });
    return { kind, thumbnailSvg: svg };
  }

  return { kind, thumbnailSvg: null };
}

export async function generateDocumentThumbnailAndCache(
  fileId: string,
  opts: {
    kind?: string | null;
    data: unknown;
  },
): Promise<string | undefined> {
  try {
    const { thumbnailSvg } = await buildDocumentThumbnailSvg(opts);
    if (!thumbnailSvg) {
      return undefined;
    }
    LocalThumbnailCache.set(fileId, thumbnailSvg);
    return thumbnailSvg;
  } catch {
    return undefined;
  }
}
