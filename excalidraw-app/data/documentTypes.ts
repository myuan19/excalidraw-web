export type DocumentKind = "excalidraw" | string;

export interface ManagedDocument<T = unknown> {
  kind: DocumentKind;
  containerVersion: number;
  formatVersion: number;
  sourceVersion?: string;
  data: T;
}

const DEFAULT_CONTAINER_VERSION = 1;
const DEFAULT_EXCALIDRAW_FORMAT_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isManagedDocument(value: unknown): value is ManagedDocument {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.containerVersion === "number" &&
    typeof value.formatVersion === "number" &&
    "data" in value
  );
}

export function isLegacyExcalidrawScene(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === "excalidraw" ||
      "elements" in value ||
      "appState" in value ||
      "files" in value)
  );
}

export function normalizeDocument(raw: unknown): ManagedDocument | null {
  if (isManagedDocument(raw)) {
    return raw;
  }

  if (isLegacyExcalidrawScene(raw)) {
    const version =
      isRecord(raw) && typeof raw.version === "number"
        ? raw.version
        : DEFAULT_EXCALIDRAW_FORMAT_VERSION;

    return {
      kind: "excalidraw",
      containerVersion: DEFAULT_CONTAINER_VERSION,
      formatVersion: version,
      data: raw,
    };
  }

  return null;
}
