import { editorRegistry } from "../editors/registry";
import { prepareExcalidrawEmbedData } from "../editors/excalidraw/embed";
import {
  buildMindMapEmbedBridgePayload,
  prepareMindMapEmbedData,
} from "../editors/mindmap/embed";

import type { ForkSceneSnapshot } from "./forkFileTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";

export type EmbedDocumentKind = string;

export function getEmbedDocumentKind(kind: unknown): string {
  return editorRegistry.resolveKind(typeof kind === "string" ? kind : undefined);
}

export function buildEmbedEditUrl(
  fileId: string | undefined,
  kind: EmbedDocumentKind,
  origin = window.location.origin,
): string {
  return editorRegistry.buildEmbedEditUrl(fileId, kind, origin);
}

export function getMindMapEmbedData(raw: unknown): MindMapDocumentData {
  return prepareMindMapEmbedData(raw);
}

export function getExcalidrawEmbedData(raw: unknown): ForkSceneSnapshot {
  return prepareExcalidrawEmbedData(raw);
}

export { buildMindMapEmbedBridgePayload };

export function prepareEmbedData(kind: string, raw: unknown): unknown {
  const plugin = editorRegistry.getByKind(kind);
  if (plugin?.prepareEmbedData) {
    return plugin.prepareEmbedData(raw);
  }
  return raw;
}

export function buildEmbedPayload(kind: string, data: unknown): unknown {
  const plugin = editorRegistry.getByKind(kind);
  if (plugin?.buildEmbedPayload) {
    return plugin.buildEmbedPayload(data);
  }
  return data;
}
