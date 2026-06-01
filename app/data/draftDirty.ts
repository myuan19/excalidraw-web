import {
  MindMapAdapter,
  isMindMapSingleRootOnly,
} from "./formats/MindMapAdapter";
import { createBlankExcalidrawInitialScene } from "./forkFileScene";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";

import type { ForkSceneSnapshot } from "./forkFileTypes";

const BLANK_EXCALIDRAW_HASH = hashSceneSnapshot(
  createBlankExcalidrawInitialScene("未命名"),
);

const BLANK_MINDMAP_HASH = hashDocumentSnapshot(
  MindMapAdapter.toDocument(MindMapAdapter.createEmpty()),
);

export function isExcalidrawDraftDirty(
  scene: ForkSceneSnapshot | null | undefined,
): boolean {
  if (!scene) {
    return false;
  }
  return hashSceneSnapshot(scene) !== BLANK_EXCALIDRAW_HASH;
}

export function isMindMapDraftDirty(document: unknown): boolean {
  if (!document) {
    return false;
  }
  if (isMindMapSingleRootOnly(document)) {
    return false;
  }
  return hashDocumentSnapshot(document) !== BLANK_MINDMAP_HASH;
}
