import { MIME_TYPES } from "@excalidraw/common";

import {
  normalizeDocument,
  type ManagedDocument,
} from "../documentTypes";
import {
  loadExcalidrawFileAsServerSceneData,
} from "../importExcalidrawScene";

import type { ForkSceneSnapshot } from "../forkFileTypes";
import type { DocumentFormatAdapter } from "./types";

const EXCALIDRAW_FORMAT_VERSION = 2;
const CONTAINER_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const ExcalidrawAdapter: DocumentFormatAdapter<ForkSceneSnapshot> = {
  kind: "excalidraw",
  currentFormatVersion: EXCALIDRAW_FORMAT_VERSION,
  extensions: [".excalidraw", ".json", ".png", ".svg"],
  mimeTypes: [
    MIME_TYPES.excalidraw,
    MIME_TYPES.json,
    MIME_TYPES.png,
    MIME_TYPES.svg,
  ],

  createEmpty(): ForkSceneSnapshot {
    return {
      elements: [],
      appState: {},
      files: {},
    };
  },

  async parse(input: Blob | unknown): Promise<ForkSceneSnapshot> {
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      return loadExcalidrawFileAsServerSceneData(input as File);
    }

    const document = normalizeDocument(input);
    if (document?.kind === "excalidraw" && this.validate(document.data)) {
      return document.data;
    }

    if (this.validate(input)) {
      return input;
    }

    throw new Error("Invalid Excalidraw document");
  },

  async serialize(data: ForkSceneSnapshot): Promise<object> {
    return data;
  },

  migrate(data: unknown): ForkSceneSnapshot {
    if (this.validate(data)) {
      return data;
    }
    const document = normalizeDocument(data);
    if (document?.kind === "excalidraw" && this.validate(document.data)) {
      return document.data;
    }
    throw new Error("Cannot migrate invalid Excalidraw document");
  },

  validate(data: unknown): data is ForkSceneSnapshot {
    return (
      isRecord(data) &&
      ("elements" in data || "appState" in data || "files" in data) &&
      (!("elements" in data) || Array.isArray(data.elements))
    );
  },

  toDocument(data: ForkSceneSnapshot): ManagedDocument<ForkSceneSnapshot> {
    return {
      kind: "excalidraw",
      containerVersion: CONTAINER_VERSION,
      formatVersion: EXCALIDRAW_FORMAT_VERSION,
      data,
    };
  },
};
