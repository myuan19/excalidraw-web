import { beforeEach, describe, expect, it } from "vitest";

import { MindMapAdapter } from "../../data/formats/registry";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import {
  clearMindMapPersistedSnapshot,
  matchesMindMapPersistedSnapshot,
  noteMindMapPersistedSnapshot,
} from "./mindMapPersistedSnapshot";

describe("mindMapPersistedSnapshot", () => {
  const fileId = "mindmap-file";
  const otherFileId = "other-mindmap-file";

  beforeEach(() => {
    clearMindMapPersistedSnapshot();
  });

  it("matches only the last persisted document hash for the same file", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    noteMindMapPersistedSnapshot(fileId, document);
    expect(matchesMindMapPersistedSnapshot(fileId, document)).toBe(true);
    expect(matchesMindMapPersistedSnapshot(otherFileId, document)).toBe(false);

    const mutated = MindMapAdapter.toDocument({
      ...document.data,
      root: {
        ...document.data.root,
        data: { ...document.data.root.data, text: "edited" },
      },
    });
    expect(matchesMindMapPersistedSnapshot(fileId, mutated)).toBe(false);
    expect(hashDocumentSnapshot(mutated)).not.toBe(
      hashDocumentSnapshot(document),
    );
  });

  it("can clear one file without dropping other persisted snapshots", () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
    noteMindMapPersistedSnapshot(fileId, document);
    noteMindMapPersistedSnapshot(otherFileId, document);

    clearMindMapPersistedSnapshot(fileId);

    expect(matchesMindMapPersistedSnapshot(fileId, document)).toBe(false);
    expect(matchesMindMapPersistedSnapshot(otherFileId, document)).toBe(true);
  });
});
