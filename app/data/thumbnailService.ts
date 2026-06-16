import { buildNativeMindMapThumbnailSvg } from "../editors/mindmap/mindMapNativeThumbnailRenderer";
import { editorRegistry } from "../editors/registry";

import { normalizeDocument } from "./documentTypes";
import { buildDocumentThumbnailSvg } from "./documentThumbnail";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { ServerSync, type ArchiveEntry } from "./ServerSync";
import {
  markMindMapThumbnailSource,
  normalizeMindMapThumbnailSvg,
  patchThumbnailSvgForCard,
  thumbnailSvgHasVisibleContent,
} from "./thumbnailSvg";

import type { MindMapDocumentData } from "./formats/MindMapAdapter";

export type ThumbnailPurpose = "file" | "archive";

export type ThumbnailBuildOpts = {
  kind?: string | null;
  data: unknown;
  purpose: ThumbnailPurpose;
  /** MindMap file list thumb: prefer native iframe export when available. */
  nativeSvg?: string | null;
};

export function isVisibleThumbnail(
  svg: string | null | undefined,
): svg is string {
  return !!svg && thumbnailSvgHasVisibleContent(svg);
}

export function isUsableStoredThumbnail(svg: string): boolean {
  return (
    /<svg\b/i.test(svg) &&
    /<\/svg>/i.test(svg) &&
    /\bdata-excal-filelist-thumb\s*=/i.test(svg) &&
    isVisibleThumbnail(svg)
  );
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

  if (opts.purpose === "archive") {
    return {
      kind: built.kind,
      thumbnailSvg: isVisibleThumbnail(built.thumbnailSvg)
        ? built.thumbnailSvg
        : null,
    };
  }

  return {
    kind: built.kind,
    thumbnailSvg: isVisibleThumbnail(built.thumbnailSvg)
      ? built.thumbnailSvg
      : null,
  };
}

export async function buildAndCacheFileThumbnail(
  fileId: string,
  opts: Omit<ThumbnailBuildOpts, "purpose">,
): Promise<string | undefined> {
  const { thumbnailSvg } = await buildThumbnail({ ...opts, purpose: "file" });
  if (!thumbnailSvg) {
    return undefined;
  }
  LocalThumbnailCache.set(fileId, thumbnailSvg);
  return thumbnailSvg;
}

export async function uploadArchiveThumbnail(
  fileId: string,
  archiveId: string,
  svg: string | null | undefined,
): Promise<void> {
  if (!isVisibleThumbnail(svg)) {
    return;
  }
  try {
    await ServerSync.putArchiveThumbnail(fileId, archiveId, svg);
  } catch {
    // Archive thumbnails are auxiliary; keep save/checkpoint success intact.
  }
}

export type ArchivePreview = {
  kind: string;
  cardThumbSvg: string | null;
};

type ArchivePayload = ArchiveEntry & {
  data?: unknown;
  kind?: string | null;
};

async function buildArchiveThumbnailFromPayload(
  fileId: string,
  archiveId: string,
): Promise<{ kind: string; thumbnailSvg: string | null }> {
  const archive = (await ServerSync.getArchive(
    fileId,
    archiveId,
  )) as ArchivePayload | null;
  return buildThumbnail({
    kind: archive?.kind,
    data: archive?.data,
    purpose: "archive",
  });
}

export async function resolveArchivePreview(
  fileId: string,
  archive: ArchiveEntry,
  fileKind?: string | null,
): Promise<ArchivePreview> {
  const fallbackKind = fileKind ?? null;

  if (archive.has_thumbnail) {
    const serverSvg = await ServerSync.getArchiveThumbnail(
      fileId,
      archive.id,
      archive.content_sha256,
    );
    if (serverSvg && isUsableStoredThumbnail(serverSvg)) {
      return {
        kind: fallbackKind || "excalidraw",
        cardThumbSvg: toCardSvg(serverSvg),
      };
    }
  }

  const built = await buildArchiveThumbnailFromPayload(fileId, archive.id);
  if (built.thumbnailSvg) {
    void uploadArchiveThumbnail(fileId, archive.id, built.thumbnailSvg);
  }
  return {
    kind: built.kind || fallbackKind || "excalidraw",
    cardThumbSvg: toCardSvg(built.thumbnailSvg),
  };
}
