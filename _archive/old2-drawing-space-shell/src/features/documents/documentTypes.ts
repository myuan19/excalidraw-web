export type DocumentKind = "excalidraw" | "mindmap" | "text" | string;

export interface ManagedDocument<T = unknown> {
  kind: DocumentKind;
  containerVersion: number;
  formatVersion: number;
  sourceVersion?: string;
  data: T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function isLegacyMindMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "mindmap") return true;
  if ("root" in value && isRecord(value.root)) return true;
  return isRecord(value.data) && ("root" in value.data || value.data.layout === "logicalStructure");
}

export function normalizeDocument(raw: unknown): ManagedDocument | null {
  if (isManagedDocument(raw)) return raw;
  if (isLegacyExcalidrawScene(raw)) {
    return {
      kind: "excalidraw",
      containerVersion: 1,
      formatVersion: isRecord(raw) && typeof raw.version === "number" ? raw.version : 1,
      data: raw,
    };
  }
  if (isLegacyMindMap(raw)) {
    const data = isRecord(raw) && raw.kind === "mindmap" && "data" in raw ? raw.data : raw;
    return {
      kind: "mindmap",
      containerVersion: 1,
      formatVersion: isRecord(raw) && typeof raw.formatVersion === "number" ? raw.formatVersion : 1,
      data,
    };
  }
  if (typeof raw === "string") {
    return { kind: "text", containerVersion: 1, formatVersion: 1, data: { text: raw } };
  }
  return null;
}
