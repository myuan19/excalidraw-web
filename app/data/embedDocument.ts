import { ExcalidrawAdapter } from "./formats/ExcalidrawAdapter";
import { MindMapAdapter } from "./formats/MindMapAdapter";
import previewViewportConfig from "../editors/mindmap/native/previewViewportConfig.json";

import type { ForkSceneSnapshot } from "./forkFileTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";

export type EmbedDocumentKind = "excalidraw" | "mindmap";

function summarizeEmbedRaw(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {
      type: raw === null ? "null" : typeof raw,
    };
  }
  const record = raw as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  return {
    keys: Object.keys(record).slice(0, 12),
    kind: typeof record.kind === "string" ? record.kind : null,
    containerVersion:
      typeof record.containerVersion === "number"
        ? record.containerVersion
        : null,
    formatVersion:
      typeof record.formatVersion === "number" ? record.formatVersion : null,
    topElements: Array.isArray(record.elements) ? record.elements.length : null,
    dataKeys: data ? Object.keys(data).slice(0, 12) : null,
    dataElements: data && Array.isArray(data.elements) ? data.elements.length : null,
    hasRoot: !!(data?.root ?? record.root),
  };
}

function debugEmbedDocument(label: string, data?: Record<string, unknown>) {
  console.info(`[DEBUG] embedDocument | ${label}`, data ?? {});
}

export function getEmbedDocumentKind(kind: unknown): EmbedDocumentKind {
  return kind === "mindmap" ? "mindmap" : "excalidraw";
}

export function buildEmbedEditUrl(
  fileId: string | undefined,
  kind: EmbedDocumentKind,
  origin = window.location.origin,
): string {
  if (!fileId) {
    return origin;
  }
  const params = new URLSearchParams();
  params.set("file", fileId);
  if (kind === "mindmap") {
    params.set("kind", "mindmap");
  }
  return `${origin}/#${params.toString()}`;
}

export function getMindMapEmbedData(raw: unknown): MindMapDocumentData {
  debugEmbedDocument("getMindMapEmbedData input", summarizeEmbedRaw(raw));
  try {
    const result = MindMapAdapter.migrate(raw, 1);
    debugEmbedDocument("getMindMapEmbedData output", {
      rootText: result.root?.data?.text ?? null,
      rootChildren: result.root?.children?.length ?? 0,
      layout: result.layout ?? null,
      hasView: !!result.view,
    });
    return result;
  } catch (error) {
    debugEmbedDocument("getMindMapEmbedData failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }
}

export function getExcalidrawEmbedData(raw: unknown): ForkSceneSnapshot {
  debugEmbedDocument("getExcalidrawEmbedData input", summarizeEmbedRaw(raw));
  try {
    const result = ExcalidrawAdapter.migrate(raw, 1);
    debugEmbedDocument("getExcalidrawEmbedData output", {
      elements: Array.isArray(result.elements) ? result.elements.length : 0,
      appStateKeys: result.appState ? Object.keys(result.appState).slice(0, 12) : [],
      files: result.files ? Object.keys(result.files).length : 0,
    });
    return result;
  } catch (error) {
    debugEmbedDocument("getExcalidrawEmbedData failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }
}

function getMindMapChildren(node: unknown): unknown[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  const children = (node as { children?: unknown }).children;
  return Array.isArray(children) ? children : [];
}

function analyzeMindMapTree(root: unknown): {
  maxDepth: number;
  leafCount: number;
  rootChildren: number;
} {
  const rootChildren = getMindMapChildren(root);
  let maxDepth = 1;
  let leafCount = rootChildren.length === 0 ? 1 : 0;
  const walk = (node: unknown, depth: number) => {
    const children = getMindMapChildren(node);
    maxDepth = Math.max(maxDepth, depth);
    if (children.length === 0) {
      leafCount += 1;
      return;
    }
    children.forEach((child) => walk(child, depth + 1));
  };
  rootChildren.forEach((child) => walk(child, 2));
  return {
    maxDepth,
    leafCount,
    rootChildren: rootChildren.length,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeMindMapPreviewRootTargetX(data: MindMapDocumentData): number {
  const metrics = analyzeMindMapTree(data.root);
  if (metrics.rootChildren === 0) {
    return 0.5;
  }
  const depthScore = clamp((metrics.maxDepth - 1) / 4, 0, 1);
  const branchScore = clamp((metrics.rootChildren - 1) / 5, 0, 1);
  const leafScore = clamp((metrics.leafCount - 1) / 14, 0, 1);
  const complexity = clamp(
    depthScore * 0.6 + branchScore * 0.25 + leafScore * 0.15,
    0,
    1,
  );
  return clamp(0.5 - complexity * 0.3, 0.2, 0.5);
}

function buildMindMapPreviewData(data: MindMapDocumentData): MindMapDocumentData {
  const config = {
    ...(data.config ?? {}),
    __nbPreviewTargetX: computeMindMapPreviewRootTargetX(data),
    __nbPreviewTargetY: 0.5,
    __nbPreviewRootScreenRatioMultiplier:
      previewViewportConfig.embedRootScreenRatioMultiplier,
  };
  const { view: _view, ...withoutView } = data;
  return {
    ...withoutView,
    config,
  };
}

export function buildMindMapEmbedBridgePayload(data: MindMapDocumentData) {
  const mindMapData = buildMindMapPreviewData(data);
  return {
    mindMapData,
    mindMapConfig: mindMapData.config ?? {},
    lang: mindMapData.lang ?? "zh",
    localConfig: mindMapData.localConfig ?? null,
    embedMode: true,
    readOnly: true,
  };
}
