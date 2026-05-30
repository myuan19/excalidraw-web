import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";

import type { ForkSceneSnapshot } from "../../data/forkFileTypes";

export function prepareExcalidrawEmbedData(raw: unknown): ForkSceneSnapshot {
  return ExcalidrawAdapter.migrate(raw, 1);
}
