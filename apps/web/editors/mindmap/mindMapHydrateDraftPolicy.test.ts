import { describe, expect, it } from "vitest";

import { MindMapAdapter } from "../../data/formats/registry";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import {
  beginMindMapOpenHydrateSession,
  createMindMapHydrateAnchor,
  explainHydrateDraftDecision,
  mindMapDataWithStrongChild,
  resolveMindMapHydrateBaselineDocument,
} from "./mindMapHydrateDraftPolicy";

describe("mindMapHydrateDraftPolicy", () => {
  const strongHtml =
    '<p><strong><span>title</span></strong></p><p><strong><span>body</span></strong></p>';

  it("accepts save-response drafts unconditionally", () => {
    const anchorDoc = MindMapAdapter.toDocument(
      mindMapDataWithStrongChild(strongHtml),
    );
    const plainDoc = MindMapAdapter.toDocument(MindMapAdapter.createEmpty());

    expect(
      explainHydrateDraftDecision({
        anchor: createMindMapHydrateAnchor(anchorDoc),
        incoming: plainDoc,
        isSaveResponse: true,
      }),
    ).toEqual({
      adoptBaseline: true,
      updateHostDocument: true,
      reason: "save-response",
    });
  });

  it("rejects hydrate drafts that lose rich text vs open anchor", () => {
    const anchorDoc = MindMapAdapter.toDocument(
      mindMapDataWithStrongChild(strongHtml),
    );
    const regressed = MindMapAdapter.toDocument({
      ...anchorDoc.data,
      root: {
        ...anchorDoc.data.root,
        children: [
          {
            data: { text: "<p><span>plain</span></p>", richText: true },
            children: [],
          },
        ],
      },
    });

    expect(
      explainHydrateDraftDecision({
        anchor: createMindMapHydrateAnchor(anchorDoc),
        incoming: regressed,
        isSaveResponse: false,
      }),
    ).toEqual({
      adoptBaseline: false,
      updateHostDocument: false,
      reason: "regressed-rich-text",
    });
  });

  it("accepts hydrate drafts with identical content hash", () => {
    const anchorDoc = MindMapAdapter.toDocument(
      mindMapDataWithStrongChild(strongHtml),
    );

    expect(
      explainHydrateDraftDecision({
        anchor: createMindMapHydrateAnchor(anchorDoc),
        incoming: anchorDoc,
        isSaveResponse: false,
      }).reason,
    ).toBe("anchor-hash-match");
  });

  it("resolveMindMapHydrateBaselineDocument falls back to session document", () => {
    const anchorDoc = MindMapAdapter.toDocument(
      mindMapDataWithStrongChild(strongHtml),
    );
    const session = beginMindMapOpenHydrateSession(anchorDoc);
    const regressed = MindMapAdapter.toDocument({
      ...anchorDoc.data,
      root: {
        ...anchorDoc.data.root,
        children: [
          {
            data: { text: "<p><span>plain</span></p>", richText: true },
            children: [],
          },
        ],
      },
    });

    const resolved = resolveMindMapHydrateBaselineDocument({
      session,
      latest: regressed,
    });

    expect(hashDocumentSnapshot(resolved)).toBe(
      hashDocumentSnapshot(anchorDoc),
    );
  });
});
