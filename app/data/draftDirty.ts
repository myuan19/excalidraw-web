import { createBlankExcalidrawInitialScene } from "./forkFileScene";
import { hashSceneSnapshot } from "./sceneHash";

import type { ForkSceneSnapshot } from "./forkFileTypes";

const BLANK_EXCALIDRAW_HASH = hashSceneSnapshot(
  createBlankExcalidrawInitialScene("未命名"),
);

export function isExcalidrawDraftDirty(
  scene: ForkSceneSnapshot | null | undefined,
): boolean {
  if (!scene) {
    return false;
  }
  return hashSceneSnapshot(scene) !== BLANK_EXCALIDRAW_HASH;
}
