import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fingerprintCatalogListing,
  formatTreeListingEtag,
  ifNoneMatchAllowsTree,
} from "./treeListingEtag.js";

describe("treeListingEtag", () => {
  it("etag stable for listing fingerprint and honors If-None-Match", () => {
    const tree = {
      folders: [{ id: "f", name: "x", created_at: "1", updated_at: "1" }],
      files: [
        {
          id: "a",
          name: "a",
          created_at: "1",
          updated_at: "2",
          has_thumbnail: true,
        },
      ],
      capabilities: {
        folderMapping: true,
        addMappedFolder: true,
        archivesEnabled: false,
      },
    };
    const etag = formatTreeListingEtag(tree);
    assert.match(etag, /^W\/"/);
    assert.equal(
      ifNoneMatchAllowsTree({ headers: { "if-none-match": etag } }, etag),
      true,
    );
    const thumbOnly = {
      ...tree,
      files: [{ ...tree.files[0], has_thumbnail: false }],
    };
    assert.equal(
      fingerprintCatalogListing(thumbOnly),
      fingerprintCatalogListing(tree),
    );
    assert.equal(formatTreeListingEtag(thumbOnly), etag);
  });
});
