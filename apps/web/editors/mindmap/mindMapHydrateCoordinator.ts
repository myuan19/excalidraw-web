import {
  beginMindMapOpenHydrateSession,
  explainHydrateDraftDecision,
  resolveMindMapHydrateBaselineDocument,
  type MindMapHydrateDraftDecision,
  type MindMapOpenHydrateSession,
} from "./mindMapHydrateDraftPolicy";

import type { MindMapSaveDocument } from "./mindMapDraftState";

export type MindMapHydrateDraftPushContext = {
  isSaveResponse: boolean;
  hydrating: boolean;
};

export type MindMapHydrateDraftPushResult = {
  document: MindMapSaveDocument;
  decision: MindMapHydrateDraftDecision;
  shouldAdoptBaseline: boolean;
  shouldMarkChanged: boolean;
  shouldExtendSettle: boolean;
};

export type MindMapHydrateCoordinator = {
  beginSession(document: MindMapSaveDocument): MindMapOpenHydrateSession;
  reset(): void;
  getSession(): MindMapOpenHydrateSession | null;
  handleDraftPush(
    incoming: MindMapSaveDocument,
    currentLatest: MindMapSaveDocument | null,
    ctx: MindMapHydrateDraftPushContext,
  ): MindMapHydrateDraftPushResult;
  settle(latest: MindMapSaveDocument): MindMapSaveDocument;
};

/**
 * 打开 hydrate 会话与 draft 入站裁决的协调层。
 * 纯内存状态 + 策略委托；不写 FileSyncState、不触碰 React。
 */
export function createMindMapHydrateCoordinator(): MindMapHydrateCoordinator {
  let session: MindMapOpenHydrateSession | null = null;

  return {
    beginSession(document) {
      session = beginMindMapOpenHydrateSession(document);
      return session;
    },

    reset() {
      session = null;
    },

    getSession() {
      return session;
    },

    handleDraftPush(incoming, currentLatest, ctx) {
      const decision = explainHydrateDraftDecision({
        anchor: session?.anchor ?? null,
        incoming,
        isSaveResponse: ctx.isSaveResponse,
      });

      const document = decision.updateHostDocument
        ? incoming
        : (session?.document ?? currentLatest ?? incoming);

      const shouldExtendSettle = ctx.hydrating && !ctx.isSaveResponse;
      const shouldAdoptBaseline =
        ctx.hydrating && !ctx.isSaveResponse && decision.adoptBaseline;
      const shouldMarkChanged = !ctx.hydrating && !ctx.isSaveResponse;

      return {
        document,
        decision,
        shouldAdoptBaseline,
        shouldMarkChanged,
        shouldExtendSettle,
      };
    },

    settle(latest) {
      return resolveMindMapHydrateBaselineDocument({
        session,
        latest,
      });
    },
  };
}
