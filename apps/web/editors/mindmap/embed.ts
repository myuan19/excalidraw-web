import {
  MindMapAdapter,
  type MindMapDocumentData,
} from "../../data/formats/MindMapAdapter";

export function prepareMindMapEmbedData(raw: unknown): MindMapDocumentData {
  return MindMapAdapter.parse(raw);
}

export function buildMindMapEmbedBridgePayload(data: unknown) {
  const mindMapData = prepareMindMapEmbedData(data);
  return {
    source: "editorhub-host",
    type: "init",
    data: mindMapData,
    view: mindMapData.view ?? null,
  };
}
