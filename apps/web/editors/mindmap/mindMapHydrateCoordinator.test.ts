import { describe, expect, it } from "vitest";

import { MindMapAdapter } from "../../data/formats/registry";
import {
  createMindMapHydrateCoordinator,
  type MindMapHydrateCoordinator,
} from "./mindMapHydrateCoordinator";
import { mindMapDataWithStrongChild } from "./mindMapHydrateDraftPolicy";

describe("mindMapHydrateCoordinator", () => {
  const strongHtml =
    '<p><strong><span>title</span></strong></p><p><strong><span>body</span></strong></p>';

  let coordinator: MindMapHydrateCoordinator;

  const anchorDoc = () =>
    MindMapAdapter.toDocument(mindMapDataWithStrongChild(strongHtml));

  const regressedDoc = () =>
    MindMapAdapter.toDocument({
      ...anchorDoc().data,
      root: {
        ...anchorDoc().data.root,
        children: [
          {
            data: { text: "<p><span>plain</span></p>", richText: true },
            children: [],
          },
        ],
      },
    });

  beforeEach(() => {
    coordinator = createMindMapHydrateCoordinator();
  });

  it("beginSession records anchor for settle fallback", () => {
    const doc = anchorDoc();
    const session = coordinator.beginSession(doc);

    expect(session.document).toBe(doc);
    expect(session.anchor.richText.totalStrongCount).toBeGreaterThan(0);
    expect(coordinator.getSession()).toBe(session);
  });

  it("rejects regressed draft during hydrate without updating authority", () => {
    const anchor = anchorDoc();
    coordinator.beginSession(anchor);

    const result = coordinator.handleDraftPush(regressedDoc(), anchor, {
      isSaveResponse: false,
      hydrating: true,
    });

    expect(result.decision.reason).toBe("regressed-rich-text");
    expect(result.document).toBe(anchor);
    expect(result.shouldAdoptBaseline).toBe(false);
    expect(result.shouldMarkChanged).toBe(false);
    expect(result.shouldExtendSettle).toBe(true);
  });

  it("adopts matching draft during hydrate", () => {
    const anchor = anchorDoc();
    coordinator.beginSession(anchor);

    const result = coordinator.handleDraftPush(anchor, anchor, {
      isSaveResponse: false,
      hydrating: true,
    });

    expect(result.decision.reason).toBe("anchor-hash-match");
    expect(result.shouldAdoptBaseline).toBe(true);
    expect(result.shouldExtendSettle).toBe(true);
  });

  it("treats user-edit draft pushes during hydrate as real changes", () => {
    const anchor = anchorDoc();
    const edited = MindMapAdapter.toDocument({
      ...anchor.data,
      root: {
        ...anchor.data.root,
        children: [
          ...(anchor.data.root.children ?? []),
          {
            data: { text: "<p><span>first child</span></p>", richText: true },
            children: [],
          },
        ],
      },
    });
    coordinator.beginSession(anchor);

    const result = coordinator.handleDraftPush(edited, anchor, {
      isSaveResponse: false,
      hydrating: true,
      userEdit: true,
    });

    expect(result.decision.reason).toBe("user-edit");
    expect(result.document).toBe(edited);
    expect(result.shouldAdoptBaseline).toBe(false);
    expect(result.shouldMarkChanged).toBe(true);
    expect(result.shouldExtendSettle).toBe(false);
  });

  it("save-response always marks changed path off and skips extend settle", () => {
    const anchor = anchorDoc();
    const incoming = regressedDoc();
    coordinator.beginSession(anchor);

    const result = coordinator.handleDraftPush(incoming, anchor, {
      isSaveResponse: true,
      hydrating: true,
    });

    expect(result.decision.reason).toBe("save-response");
    expect(result.shouldAdoptBaseline).toBe(false);
    expect(result.shouldMarkChanged).toBe(false);
    expect(result.shouldExtendSettle).toBe(false);
    expect(result.document).toBe(incoming);
  });

  it("marks document changed after hydrate window", () => {
    const anchor = anchorDoc();
    coordinator.beginSession(anchor);

    const result = coordinator.handleDraftPush(anchor, anchor, {
      isSaveResponse: false,
      hydrating: false,
    });

    expect(result.shouldMarkChanged).toBe(true);
    expect(result.shouldAdoptBaseline).toBe(false);
    expect(result.shouldExtendSettle).toBe(false);
  });

  it("settle falls back to session document when latest regressed", () => {
    const anchor = anchorDoc();
    coordinator.beginSession(anchor);

    const settled = coordinator.settle(regressedDoc());

    expect(settled).toBe(anchor);
  });

  it("reset clears session so settle uses latest only", () => {
    const anchor = anchorDoc();
    const latest = regressedDoc();
    coordinator.beginSession(anchor);
    coordinator.reset();

    expect(coordinator.settle(latest)).toStrictEqual(latest);
  });
});
