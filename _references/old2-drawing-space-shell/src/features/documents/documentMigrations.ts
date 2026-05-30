import {
  isManagedDocument,
  normalizeDocument,
  type DocumentKind,
  type ManagedDocument,
} from "./documentTypes";

export const CURRENT_CONTAINER_VERSION = 1;

const CURRENT_FORMAT_VERSIONS: Record<string, number> = {
  excalidraw: 2,
  mindmap: 1,
  text: 1,
};

type FormatMigration = (data: unknown) => unknown;

const formatMigrations: Record<string, Record<number, FormatMigration>> = {
  excalidraw: {
    1: (data) => data,
  },
  mindmap: {},
  text: {},
};

export function getCurrentFormatVersion(kind: DocumentKind): number | null {
  return CURRENT_FORMAT_VERSIONS[kind] ?? null;
}

export function migrateManagedDocument(raw: unknown): ManagedDocument {
  const document = normalizeDocument(raw);
  if (!document) throw new Error("Cannot migrate unknown document");
  if (document.containerVersion > CURRENT_CONTAINER_VERSION) {
    throw new Error(`Unsupported containerVersion ${document.containerVersion}`);
  }

  const currentFormatVersion = getCurrentFormatVersion(document.kind);
  if (currentFormatVersion == null) {
    throw new Error(`Unsupported document kind ${document.kind}`);
  }
  if (document.formatVersion > currentFormatVersion) {
    throw new Error(`Unsupported ${document.kind} formatVersion ${document.formatVersion}`);
  }

  let data = document.data;
  for (let version = document.formatVersion; version < currentFormatVersion; version += 1) {
    const migration = formatMigrations[document.kind]?.[version];
    if (!migration) {
      throw new Error(`Missing migration for ${document.kind} formatVersion ${version} -> ${version + 1}`);
    }
    data = migration(data);
  }

  return {
    ...document,
    containerVersion: CURRENT_CONTAINER_VERSION,
    formatVersion: currentFormatVersion,
    data,
  };
}

export function maybeMigrateManagedDocument(raw: unknown): ManagedDocument | null {
  if (!isManagedDocument(raw)) return null;
  return migrateManagedDocument(raw);
}
