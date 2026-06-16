import { buildNativeMindMapThumbnailSvg } from "../editors/mindmap/mindMapNativeThumbnailRenderer";
import { editorRegistry } from "../editors/registry";

import { normalizeDocument } from "./documentTypes";
import { buildDocumentThumbnailSvg } from "./documentThumbnail";
import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  markMindMapThumbnailSource,
  normalizeMindMapThumbnailSvg,
  patchThumbnailSvgForCard,
  thumbnailSvgHasVisibleContent,
} from "./thumbnailSvg";

import type { MindMapDocumentData } from "./formats/MindMapAdapter";

export type ThumbnailBuildOpts = {
  kind?: string | null;
  data: unknown;
  /** MindMap file list thumb: prefer native iframe export when available. */
  nativeSvg?: string | null;
};

export function isVisibleThumbnail(
  svg: string | null | undefined,
): svg is string {
  return !!svg && thumbnailSvgHasVisibleContent(svg);
}

export function toCardSvg(svg: string | null | undefined): string | null {
  if (!isVisibleThumbnail(svg)) {
    return null;
  }
  return patchThumbnailSvgForCard(svg);
}

/** Resolve MindMap thumbnails only from native simple-mind-map renderer output. */
async function resolveNativeMindMapSvg(
  data: unknown,
  nativeSvg: string | null | undefined,
): Promise<string | null> {
  if (nativeSvg) {
    const normalizedNative = markMindMapThumbnailSource(
      normalizeMindMapThumbnailSvg(nativeSvg),
      "native",
    );
    if (isVisibleThumbnail(normalizedNative)) {
      return normalizedNative;
    }
  }
  const document = normalizeDocument(data);
  const mindMapData = document?.data ?? data;
  const rendered = await buildNativeMindMapThumbnailSvg(
    mindMapData as MindMapDocumentData,
  );
  return rendered && isVisibleThumbnail(rendered) ? rendered : null;
}

export async function buildThumbnail(
  opts: ThumbnailBuildOpts,
): Promise<{ kind: string; thumbnailSvg: string | null }> {
  const document = normalizeDocument(opts.data);
  const kind = editorRegistry.resolveKind(document?.kind ?? opts.kind);

  if (kind === "mindmap") {
    return {
      kind,
      thumbnailSvg: await resolveNativeMindMapSvg(opts.data, opts.nativeSvg),
    };
  }

  const built = await buildDocumentThumbnailSvg({
    kind: opts.kind,
    data: opts.data,
  });

  return {
    kind: built.kind,
    thumbnailSvg: isVisibleThumbnail(built.thumbnailSvg)
      ? built.thumbnailSvg
      : null,
  };
}

export async function buildAndCacheFileThumbnail(
  fileId: string,
  opts: ThumbnailBuildOpts,
): Promise<string | undefined> {
  const { thumbnailSvg } = await buildThumbnail(opts);
  if (!thumbnailSvg) {
    return undefined;
  }
  LocalThumbnailCache.set(fileId, thumbnailSvg);
  return thumbnailSvg;
}
