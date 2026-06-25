import { existsSync, realpathSync } from "fs";
import path from "path";

/**
 * Mapping roots are parallel top-level mounts — never nested under other folders.
 */

export function resolveMappingRootPath(absPath) {
  const resolved = path.resolve(String(absPath || "").trim());
  if (!resolved) {
    return "";
  }
  try {
    if (existsSync(resolved)) {
      return realpathSync.native(resolved);
    }
  } catch {
    // Fall back to resolved path when realpath is unavailable.
  }
  return resolved;
}

export function collectFolderDescendantIds(folders, rootIds) {
  const ids = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders ?? []) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function remapFolderIds(meta, idRemap) {
  if (!idRemap.size) {
    return;
  }
  for (const folder of meta.folders ?? []) {
    if (folder.parent_id && idRemap.has(folder.parent_id)) {
      folder.parent_id = idRemap.get(folder.parent_id);
    }
  }
  for (const file of meta.files ?? []) {
    if (file.folder_id && idRemap.has(file.folder_id)) {
      file.folder_id = idRemap.get(file.folder_id);
    }
  }
  for (const root of meta.mapping_roots ?? []) {
    if (root.mountFolderId && idRemap.has(root.mountFolderId)) {
      root.mountFolderId = idRemap.get(root.mountFolderId);
    }
  }
}

function folderKeepScore(meta, folder) {
  let score = 0;
  if (folder.is_mapping_root) {
    score += 4;
  }
  if ((meta.mapping_roots ?? []).some((root) => root.mountFolderId === folder.id)) {
    score += 8;
  }
  return score;
}

/** Force mapping mount folders (and mapping_roots metadata) to the tree root. */
export function normalizeMappingRootPlacement(meta) {
  let changed = false;
  const mappingRoots = meta.mapping_roots ?? [];
  const mountIds = new Set(
    mappingRoots.map((root) => root.mountFolderId).filter(Boolean),
  );

  for (const root of mappingRoots) {
    if (root.parent_folder_id != null) {
      root.parent_folder_id = null;
      changed = true;
    }
    const resolved = resolveMappingRootPath(root.absPath);
    if (resolved && root.absPath !== resolved) {
      root.absPath = resolved;
      changed = true;
    }
  }

  for (const folder of meta.folders ?? []) {
    const isMount =
      folder.is_mapping_root || mountIds.has(folder.id);
    if (!isMount) {
      continue;
    }
    if (folder.parent_id != null) {
      folder.parent_id = null;
      changed = true;
    }
    if (!folder.is_mapping_root) {
      folder.is_mapping_root = true;
      changed = true;
    }
  }

  return changed;
}

/** Keep one mapping root per absolute path; drop duplicate mounts and their catalog entries. */
export function dedupeMappingRoots(meta) {
  let changed = false;
  const roots = meta.mapping_roots ?? [];
  const kept = [];
  const seenPaths = new Set();
  const droppedMountIds = new Set();

  for (const root of roots) {
    const key = resolveMappingRootPath(root.absPath);
    if (!key || seenPaths.has(key)) {
      if (root?.mountFolderId) {
        droppedMountIds.add(root.mountFolderId);
      }
      changed = true;
      continue;
    }
    seenPaths.add(key);
    kept.push({ ...root, absPath: key });
  }

  if (!changed) {
    return false;
  }

  meta.mapping_roots = kept;
  const dropIds = collectFolderDescendantIds(meta.folders, [...droppedMountIds]);
  for (const mountId of droppedMountIds) {
    dropIds.add(mountId);
  }
  meta.folders = (meta.folders ?? []).filter((folder) => !dropIds.has(folder.id));
  meta.files = (meta.files ?? []).filter(
    (file) => file.folder_id == null || !dropIds.has(file.folder_id),
  );
  return true;
}

/** Collapse duplicate folder records that share the same persisted path key. */
export function dedupeFoldersByPath(meta) {
  const keptByPath = new Map();
  const idRemap = new Map();
  let changed = false;

  for (const folder of meta.folders ?? []) {
    const key = folder.path;
    if (!key) {
      continue;
    }
    const existing = keptByPath.get(key);
    if (!existing) {
      keptByPath.set(key, folder);
      continue;
    }
    changed = true;
    const keep =
      folderKeepScore(meta, folder) >= folderKeepScore(meta, existing)
        ? folder
        : existing;
    const drop = keep.id === folder.id ? existing : folder;
    keptByPath.set(key, keep);
    idRemap.set(drop.id, keep.id);
  }

  if (!changed) {
    return false;
  }

  meta.folders = [...keptByPath.values()];
  remapFolderIds(meta, idRemap);
  return true;
}

/** Remove mapping mounts/roots that no longer reference each other. */
export function removeOrphanMappingMounts(meta) {
  let changed = false;
  const mountIds = new Set(
    (meta.mapping_roots ?? []).map((root) => root.mountFolderId).filter(Boolean),
  );
  const folderIds = new Set((meta.folders ?? []).map((folder) => folder.id));

  const orphanRootMountIds = [...mountIds].filter((id) => !folderIds.has(id));
  if (orphanRootMountIds.length) {
    meta.mapping_roots = (meta.mapping_roots ?? []).filter(
      (root) => !orphanRootMountIds.includes(root.mountFolderId),
    );
    changed = true;
  }

  const validMountIds = new Set(
    (meta.mapping_roots ?? []).map((root) => root.mountFolderId).filter(Boolean),
  );
  const orphanMountFolderIds = (meta.folders ?? [])
    .filter((folder) => folder.is_mapping_root && !validMountIds.has(folder.id))
    .map((folder) => folder.id);
  if (!orphanMountFolderIds.length) {
    return changed;
  }

  const dropIds = collectFolderDescendantIds(meta.folders, orphanMountFolderIds);
  meta.folders = (meta.folders ?? []).filter((folder) => !dropIds.has(folder.id));
  meta.files = (meta.files ?? []).filter(
    (file) => file.folder_id == null || !dropIds.has(file.folder_id),
  );
  return true;
}

export function repairMappingMeta(meta) {
  let changed = false;
  if (normalizeMappingRootPlacement(meta)) {
    changed = true;
  }
  if (dedupeMappingRoots(meta)) {
    changed = true;
  }
  if (dedupeFoldersByPath(meta)) {
    changed = true;
  }
  if (removeOrphanMappingMounts(meta)) {
    changed = true;
  }
  return changed;
}

function folderByIdMap(folders) {
  const map = new Map();
  for (const folder of folders ?? []) {
    map.set(folder.id, folder);
  }
  return map;
}

function isUnderActiveMount(folderId, folderMap, activeMountIds) {
  if (activeMountIds.has(folderId)) {
    return true;
  }
  let current = folderMap.get(folderId);
  const seen = new Set();
  while (current?.parent_id && !seen.has(current.id)) {
    if (activeMountIds.has(current.parent_id)) {
      return true;
    }
    seen.add(current.id);
    current = folderMap.get(current.parent_id);
  }
  return false;
}

/** Drop scan output for mapping roots that were removed while a scan was running. */
export function reconcileScanMetaWithMappingRoots(scanned, current) {
  const activeRoots = current.mapping_roots ?? [];
  const activeMountIds = new Set(
    activeRoots.map((root) => root.mountFolderId).filter(Boolean),
  );
  const folderMap = folderByIdMap([
    ...(current.folders ?? []),
    ...(scanned.folders ?? []),
  ]);

  const folders = (scanned.folders ?? []).filter((folder) => {
    if (folder.is_mapping_root || activeMountIds.has(folder.id)) {
      return activeMountIds.has(folder.id);
    }
    return isUnderActiveMount(folder.id, folderMap, activeMountIds);
  });

  const folderIds = new Set(folders.map((folder) => folder.id));
  const files = (scanned.files ?? []).filter(
    (file) => file.folder_id == null || folderIds.has(file.folder_id),
  );

  return {
    ...scanned,
    mapping_roots: activeRoots,
    folders,
    files,
  };
}

/**
 * Merge a scan checkpoint into persisted meta without resurrecting removed mappings
 * or wiping non-mapping workspace folders/files.
 */
export function mergeScanCheckpoint(scanned, current) {
  return mergeScanCheckpointInner(scanned, current, {
    preserveUnseenMappingEntries: false,
  });
}

export function mergePartialScanCheckpoint(scanned, current) {
  return mergeScanCheckpointInner(scanned, current, {
    preserveUnseenMappingEntries: true,
  });
}

function mergeScanCheckpointInner(scanned, current, options) {
  const activeRoots = current.mapping_roots ?? [];
  const activeMountIds = new Set(
    activeRoots.map((root) => root.mountFolderId).filter(Boolean),
  );
  const folderMap = folderByIdMap([
    ...(current.folders ?? []),
    ...(scanned.folders ?? []),
  ]);
  const allKnownMountIds = new Set([
    ...activeMountIds,
    ...(scanned.mapping_roots ?? []).map((root) => root.mountFolderId),
  ]);
  const mappingTreeIds = collectFolderDescendantIds(
    [...folderMap.values()],
    [...allKnownMountIds],
  );

  const workspaceFolders = (current.folders ?? []).filter(
    (folder) => !mappingTreeIds.has(folder.id),
  );
  const workspaceFiles = (current.files ?? []).filter(
    (file) => file.folder_id == null || !mappingTreeIds.has(file.folder_id),
  );

  const scanSlice = reconcileScanMetaWithMappingRoots(scanned, current);
  const folders = options.preserveUnseenMappingEntries
    ? mergeById(
        (current.folders ?? []).filter((folder) => mappingTreeIds.has(folder.id)),
        scanSlice.folders,
      )
    : scanSlice.folders;
  const preservedFolderIds = new Set(folders.map((folder) => folder.id));
  const files = options.preserveUnseenMappingEntries
    ? mergeById(
        (current.files ?? []).filter(
          (file) => file.folder_id != null && preservedFolderIds.has(file.folder_id),
        ),
        scanSlice.files,
      )
    : scanSlice.files;
  const merged = {
    ...current,
    mapping_roots: activeRoots,
    folders: [...workspaceFolders, ...folders],
    files: [...workspaceFiles, ...files],
  };
  repairMappingMeta(merged);
  return merged;
}

function mergeById(currentItems, scannedItems) {
  const byId = new Map();
  for (const item of currentItems ?? []) {
    if (item?.id) {
      byId.set(item.id, item);
    }
  }
  for (const item of scannedItems ?? []) {
    if (item?.id) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}
