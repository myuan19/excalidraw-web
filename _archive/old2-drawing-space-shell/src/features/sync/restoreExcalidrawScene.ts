import { LocalData } from "./LocalData";

function collectFileIds(elements: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    const fileId = (element as { fileId?: unknown }).fileId;
    if (typeof fileId === "string" && fileId) {
      ids.add(fileId);
    }
  }
  return [...ids];
}

export async function mergeMissingLocalFiles(
  scene: {
    elements?: readonly unknown[];
    files?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const files = { ...(scene.files ?? {}) };
  const missingIds = collectFileIds(scene.elements ?? []).filter((id) => !files[id]);
  if (!missingIds.length) return files;
  const restored = await LocalData.getFiles(missingIds);
  return { ...files, ...restored };
}

export async function hydrateExcalidrawSceneOnOpen(
  scene: {
    elements?: readonly unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  },
): Promise<{
  elements?: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}> {
  const files = await mergeMissingLocalFiles(scene);
  await LocalData.clearObsoleteFiles(Object.keys(files));
  return { ...scene, files };
}
