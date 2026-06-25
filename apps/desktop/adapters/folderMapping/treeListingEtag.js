import { createHash } from "crypto";

/** 与前端 fingerprintCatalogListing 对齐，用于 GET /tree 的 ETag。 */
export function fingerprintCatalogListing(tree) {
  let maxUpdated = "";
  for (const file of tree.files ?? []) {
    if (file.updated_at && file.updated_at > maxUpdated) {
      maxUpdated = file.updated_at;
    }
  }
  for (const folder of tree.folders ?? []) {
    if (folder.updated_at && folder.updated_at > maxUpdated) {
      maxUpdated = folder.updated_at;
    }
  }
  let pendingCount = 0;
  for (const file of tree.files ?? []) {
    if (file.scan_pending || file.health === "pending") {
      pendingCount += 1;
    }
  }
  const caps = tree.capabilities;
  const capKey = caps
    ? `${caps.folderMapping ? 1 : 0}${caps.addMappedFolder ? 1 : 0}${caps.archivesEnabled ? 1 : 0}`
    : "";
  return [
    (tree.folders ?? []).length,
    (tree.files ?? []).length,
    pendingCount,
    maxUpdated,
    capKey,
  ].join("|");
}

export function formatTreeListingEtag(tree) {
  const digest = createHash("sha256")
    .update(fingerprintCatalogListing(tree))
    .digest("base64url")
    .slice(0, 22);
  return `W/"${digest}"`;
}

export function ifNoneMatchAllowsTree(req, etag) {
  if (!etag) {
    return false;
  }
  const header = req.headers["if-none-match"];
  if (!header) {
    return false;
  }
  const tokens = String(header)
    .split(",")
    .map((part) => part.trim());
  return tokens.includes(etag) || tokens.includes("*");
}
