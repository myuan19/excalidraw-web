import type { ManagedDocument } from "../documentTypes";
import type { ForkSceneSnapshot } from "../forkFileTypes";

import type { DocumentFormatAdapter } from "./types";

const DEFAULT_CONTAINER_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const ExcalidrawAdapter: DocumentFormatAdapter<ForkSceneSnapshot> = {
  kind: "excalidraw",
  extensions: [".excalidraw"],
  mimeTypes: ["application/vnd.excalidraw+json", "application/json"],

  createEmpty(name = "Untitled"): ForkSceneSnapshot {
    return {
      type: "excalidraw",
      version: 2,
      source: "editorhub",
      elements: [],
      appState: { name },
      files: {},
    } as ForkSceneSnapshot;
  },

  validate(value: unknown): value is ForkSceneSnapshot {
    return (
      isRecord(value) &&
      (value.type === "excalidraw" ||
        "elements" in value ||
        "appState" in value ||
        "files" in value)
    );
  },

  toDocument(data: ForkSceneSnapshot): ManagedDocument<ForkSceneSnapshot> {
    return {
      kind: "excalidraw",
      containerVersion: DEFAULT_CONTAINER_VERSION,
      formatVersion:
        isRecord(data) && typeof data.version === "number" ? data.version : 1,
      data,
    };
  },

  serialize(data: ForkSceneSnapshot): unknown {
    return data;
  },

  parse(raw: unknown): ForkSceneSnapshot {
    if (this.validate(raw)) {
      return raw;
    }
    if (isRecord(raw) && this.validate(raw.data)) {
      return raw.data;
    }
    throw new Error("Invalid Excalidraw document");
  },
};
