/**
 * 桌面端 Tab 缓存宿主可观测性（user-trace → desktop-op.log）。
 *
 * 过滤：`[DEBUG] user-trace | tab | cacheHost` 或 module `tabCache`
 * 控制台：`window.__EDITORHUB_DEBUG__.tabCacheSummary()`
 */

import { createLogger } from "./logger";
import { id8, traceTab } from "./interactionDebugTrace";
import type { TracePhase } from "./userTrace";

const logCache = createLogger({ module: "tabCache" });

type PaneSnapshot = {
  tabId: string;
  fileId8: string | null;
  kind: string | null;
  title?: string;
  active: boolean;
  visible: "active" | "cached" | "home";
};

type HostSnapshot = {
  activeTabId: string;
  hash: string;
  homeActive: boolean;
  hostMode: "home-active" | "file-active";
  hasFileTabs: boolean;
  hasActiveFilePane: boolean;
  panes: PaneSnapshot[];
};

let lastHostSnapshot: HostSnapshot | null = null;
let lastWhiteScreenAt = 0;
let whiteScreenCount = 0;
let lastActivateAt = 0;
let lastActivateTabId: string | null = null;

export function recordTabActivateAttempt(tabId: string, via: string): void {
  lastActivateAt = Date.now();
  lastActivateTabId = tabId;
  traceTabCache("activateAttempt", { tabId, via }, "start");
}

export function traceTabCache(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "ok",
): void {
  traceTab(`cacheHost.${action}`, data, phase);
  if (phase === "fail") {
    logCache.warn(action, data ?? {});
  } else {
    logCache.debug(action, data ?? {});
  }
}

export function publishTabCacheHostSnapshot(snapshot: HostSnapshot): void {
  lastHostSnapshot = snapshot;
  const activePane = snapshot.panes.find((pane) => pane.active);
  traceTabCache(
    "layout",
    {
      activeTabId: snapshot.activeTabId,
      hash: snapshot.hash,
      homeActive: snapshot.homeActive,
      hostMode: snapshot.hostMode,
      hasFileTabs: snapshot.hasFileTabs,
      hasActiveFilePane: snapshot.hasActiveFilePane,
      activePaneTabId: activePane?.tabId ?? null,
      activePaneFileId8: activePane?.fileId8 ?? null,
      paneCount: snapshot.panes.length,
    },
    snapshot.hasActiveFilePane || snapshot.homeActive ? "ok" : "fail",
  );
}

export function traceTabCacheWhiteScreen(
  snapshot: HostSnapshot,
  reason: string,
): void {
  whiteScreenCount += 1;
  lastWhiteScreenAt = Date.now();
  traceTabCache(
    "whiteScreen",
    {
      reason,
      ...snapshot,
      lastActivateTabId,
      msSinceActivate:
        lastActivateAt > 0 ? Date.now() - lastActivateAt : null,
    },
    "fail",
  );
  logCache.warn("white screen detected", {
    reason,
    activeTabId: snapshot.activeTabId,
    hash: snapshot.hash,
    paneIds: snapshot.panes.map((pane) => pane.tabId),
  });
}

export function buildTabCacheHostSnapshot(input: {
  activeTabId: string;
  hash: string;
  homeActive: boolean;
  hasFileTabs: boolean;
  activeFileTab: { id: string; fileId: string; kind: string; title: string } | null;
  fileTabs: Array<{ id: string; fileId: string; kind: string; title: string }>;
}): HostSnapshot {
  const panes: PaneSnapshot[] = [
    {
      tabId: "home",
      fileId8: null,
      kind: null,
      title: "首页",
      active: input.homeActive,
      visible: input.homeActive ? "active" : "cached",
    },
    ...input.fileTabs.map((tab) => ({
      tabId: tab.id,
      fileId8: id8(tab.fileId),
      kind: tab.kind,
      title: tab.title,
      active: tab.id === input.activeTabId,
      visible:
        tab.id === input.activeTabId
          ? ("active" as const)
          : ("cached" as const),
    })),
  ];
  return {
    activeTabId: input.activeTabId,
    hash: input.hash,
    homeActive: input.homeActive,
    hostMode: input.homeActive ? "home-active" : "file-active",
    hasFileTabs: input.hasFileTabs,
    hasActiveFilePane: !!input.activeFileTab,
    panes,
  };
}

export function getTabCacheTraceSummary(): Record<string, unknown> {
  return {
    lastHostSnapshot,
    whiteScreenCount,
    lastWhiteScreenAt,
    lastActivateTabId,
    lastActivateAt,
    msSinceActivate:
      lastActivateAt > 0 ? Date.now() - lastActivateAt : null,
  };
}
