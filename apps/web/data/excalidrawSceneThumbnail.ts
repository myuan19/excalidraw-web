import { debounce } from "@excalidraw/common";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { exportToSvg } from "@excalidraw/excalidraw/scene/export";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { canonicalizeExcalidrawSceneFileName } from "./excalidrawFileNameAuthority";
import { hashSceneSnapshot } from "./sceneHash";
import {
  appStateForThumbnailExport,
  FILE_LIST_THUMB_EXPORT_PADDING,
} from "./thumbnailExport";

export type ExcalidrawThumbnailScene = {
  elements: unknown;
  appState: unknown;
  files: unknown;
};

export type ExcalidrawSceneForThumbnail = {
  scene: ExcalidrawThumbnailScene;
  sceneHash: string;
};

export function resolveExcalidrawSceneForThumbnail(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): ExcalidrawSceneForThumbnail {
  const canonicalScene = canonicalizeExcalidrawSceneFileName(fileId, scene);
  return {
    scene: canonicalScene,
    sceneHash: hashSceneSnapshot(canonicalScene),
  };
}

function resolveExportAppState(appState: unknown) {
  const base =
    appState && typeof appState === "object" && !Array.isArray(appState)
      ? { ...getDefaultAppState(), ...(appState as Record<string, unknown>) }
      : getDefaultAppState();
  return appStateForThumbnailExport(
    base as Parameters<typeof appStateForThumbnailExport>[0],
  );
}

function resolveExportFiles(files: unknown): BinaryFiles {
  return files && typeof files === "object" && !Array.isArray(files)
    ? (files as BinaryFiles)
    : {};
}

/** Native Excalidraw export: same renderer as the editor for faithful previews. */
export async function buildExcalidrawSceneThumbnailSvg(
  scene: ExcalidrawThumbnailScene,
): Promise<string> {
  const elements = Array.isArray(scene.elements)
    ? restoreElements(scene.elements as ExcalidrawElement[], null, {
        deleteInvisibleElements: true,
      })
    : [];
  const exportAppState = resolveExportAppState(scene.appState);
  const files = resolveExportFiles(scene.files);

  const svgEl = await exportToSvg(
    elements as readonly NonDeletedExcalidrawElement[],
    {
      exportBackground: exportAppState.exportBackground ?? true,
      exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
      viewBackgroundColor: exportAppState.viewBackgroundColor ?? "#ffffff",
      exportWithDarkMode: exportAppState.exportWithDarkMode ?? false,
      exportEmbedScene: false,
      frameRendering: exportAppState.frameRendering,
    },
    files,
    { skipInliningFonts: true },
  );

  return new XMLSerializer().serializeToString(svgEl);
}

const debouncedGenerateByFile = new Map<
  string,
  ReturnType<typeof debounce<[ExcalidrawThumbnailScene]>>
>();

/** Debounced draft preview generation, aligned with MindMap export cadence. */
export function scheduleExcalidrawSceneThumbnailGeneration(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
  run: (resolved: ExcalidrawSceneForThumbnail) => void,
): void {
  let debounced = debouncedGenerateByFile.get(fileId);
  if (!debounced) {
    debounced = debounce((latestScene: ExcalidrawThumbnailScene) => {
      run(resolveExcalidrawSceneForThumbnail(fileId, latestScene));
    }, 320);
    debouncedGenerateByFile.set(fileId, debounced);
  }
  debounced(scene);
}

export function cancelScheduledExcalidrawSceneThumbnailGeneration(
  fileId: string,
): void {
  debouncedGenerateByFile.get(fileId)?.cancel();
}
