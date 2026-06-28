import { isDesktopEditorHub } from "../lib/runtimePlatform";

export type CatalogCapabilities = {
  folderMapping: boolean;
  addMappedFolder: boolean;
  archivesEnabled: boolean;
};

export const WEB_CATALOG_CAPABILITIES: CatalogCapabilities = {
  folderMapping: false,
  addMappedFolder: false,
  archivesEnabled: true,
};

export const DESKTOP_CATALOG_CAPABILITIES: CatalogCapabilities = {
  folderMapping: true,
  addMappedFolder: true,
  archivesEnabled: false,
};

export function parseCatalogCapabilities(
  value: unknown,
  fallback: CatalogCapabilities = WEB_CATALOG_CAPABILITIES,
): CatalogCapabilities {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  return {
    folderMapping: record.folderMapping === true,
    addMappedFolder: record.addMappedFolder === true,
    archivesEnabled: record.archivesEnabled !== false,
  };
}

/** Use runtime platform defaults when the tree payload omits capabilities. */
export function resolveRuntimeCatalogCapabilities(
  value: unknown,
): CatalogCapabilities {
  return parseCatalogCapabilities(
    value,
    isDesktopEditorHub()
      ? DESKTOP_CATALOG_CAPABILITIES
      : WEB_CATALOG_CAPABILITIES,
  );
}

export function isDiscoveredCatalogFile(
  file: { origin?: string; importable?: boolean; health?: string } | null | undefined,
): boolean {
  if (!file || file.health === "corrupt") {
    return false;
  }
  if (file.origin === "discovered") {
    return true;
  }
  return file.importable === true;
}

export function isCorruptCatalogFile(
  file:
    | { health?: string; corrupt?: boolean; parse_error?: string | null }
    | null
    | undefined,
): boolean {
  if (!file) {
    return false;
  }
  return file.health === "corrupt" || file.corrupt === true;
}

export function isManagedCatalogFile(
  file: { origin?: string } | null | undefined,
): boolean {
  if (!file) {
    return true;
  }
  return file.origin !== "discovered";
}
