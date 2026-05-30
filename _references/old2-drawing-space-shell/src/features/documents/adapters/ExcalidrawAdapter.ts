import { loadFromBlob } from "@excalidraw/excalidraw";
import { normalizeDocument, isRecord, type ManagedDocument } from "../documentTypes";
import type { DocumentFormatAdapter } from "./types";

export type ExcalidrawSceneData = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  [key: string]: unknown;
};

export function createImageSceneFromFile(file: File, dataUrl: string): ExcalidrawSceneData {
  const id = `image-${crypto.randomUUID()}`;
  return {
    type: "excalidraw",
    version: 2,
    source: "excalidraw-web",
    elements: [
      {
        id: crypto.randomUUID(),
        type: "image",
        x: 0,
        y: 0,
        width: 420,
        height: 320,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        seed: Math.floor(Math.random() * 1_000_000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 1_000_000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        status: "saved",
        fileId: id,
        scale: [1, 1],
        crop: null,
      },
    ],
    appState: { viewBackgroundColor: "rgb(255 255 255)" },
    files: {
      [id]: {
        id,
        mimeType: file.type || "application/octet-stream",
        dataURL: dataUrl,
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    },
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export const ExcalidrawDocumentAdapter: DocumentFormatAdapter<ExcalidrawSceneData> = {
  kind: "excalidraw",
  currentFormatVersion: 2,
  extensions: [".excalidraw", ".json", ".png", ".svg", ".jpg", ".jpeg"],
  mimeTypes: ["application/json", "image/png", "image/svg+xml", "image/jpeg"],

  createEmpty() {
    return { elements: [], appState: {}, files: {} };
  },

  async parse(input) {
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      const file = input as File;
      const isImage = file.type.startsWith("image/") || /\.(png|svg)$/i.test(file.name);
      if (isImage) {
        try {
          const scene = await loadFromBlob(file, null, null);
          if (scene?.elements) {
            return {
              elements: scene.elements,
              appState: scene.appState as unknown as Record<string, unknown>,
              files: scene.files as unknown as Record<string, unknown>,
            };
          }
        } catch {
          // Plain images are imported as image elements.
        }
        return createImageSceneFromFile(file, await readAsDataUrl(file));
      }
      return this.migrate(JSON.parse(await input.text()));
    }

    const document = normalizeDocument(input);
    if (document?.kind === "excalidraw" && this.validate(document.data)) {
      return document.data;
    }
    if (this.validate(input)) return input;
    throw new Error("Invalid Excalidraw document");
  },

  async serialize(data) {
    return data;
  },

  migrate(data) {
    const document = normalizeDocument(data);
    if (document?.kind === "excalidraw" && this.validate(document.data)) return document.data;
    if (this.validate(data)) return data;
    throw new Error("Cannot migrate invalid Excalidraw document");
  },

  validate(data): data is ExcalidrawSceneData {
    return isRecord(data) && Array.isArray(data.elements);
  },

  toDocument(data): ManagedDocument<ExcalidrawSceneData> {
    return {
      kind: "excalidraw",
      containerVersion: 1,
      formatVersion: 2,
      data,
    };
  },
};
