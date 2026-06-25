import type { ForkSceneSnapshot } from "./forkFileTypes";

function hasPersistedExcalidrawElements(elements: unknown): boolean {
  if (!Array.isArray(elements)) {
    return false;
  }
  return elements.some(
    (element) =>
      element &&
      typeof element === "object" &&
      !(element as { isDeleted?: boolean }).isDeleted,
  );
}

/** 空画布模板：无元素、无嵌入文件（与 MindMap 单根模板语义一致）。 */
export function isExcalidrawTemplateScene(
  scene: ForkSceneSnapshot | null | undefined,
): boolean {
  if (!scene) {
    return true;
  }
  if (hasPersistedExcalidrawElements(scene.elements)) {
    return false;
  }
  const files =
    scene.files && typeof scene.files === "object" && !Array.isArray(scene.files)
      ? scene.files
      : {};
  return Object.keys(files).length === 0;
}

export function isExcalidrawDraftDirty(
  scene: ForkSceneSnapshot | null | undefined,
): boolean {
  return !isExcalidrawTemplateScene(scene);
}
