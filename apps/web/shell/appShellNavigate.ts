import { devDebug } from "../lib/devDebug";
import { traceUserAction } from "../lib/userTrace";
import { APP_SHELL_GO_HOME } from "./Sidebar";
import {
  activateHomeTabWithoutSnapshot,
  openEditorFileTab,
} from "./editorTabNavigation";
import { buildViewHash, type AppView } from "./useAppView";

export const APP_SHELL_PENDING_NAVIGATION_CHANGE =
  "app-shell-pending-navigation-change";

export type AppShellNavigateDetail = {
  /** 离开编辑器后进入的主页视图（默认 home） */
  target?: Exclude<AppView, "editor">;
  /** 离开编辑器后打开的另一份文档（与文件列表打开同一 hash 规则） */
  openFile?: { id: string; kind: string };
};

export type AppShellPendingNavigationChangeDetail = {
  pending: AppShellNavigateDetail | null;
  consumed: AppShellNavigateDetail | null;
  reason: "set" | "clear" | "run";
};

let pendingShellNavigation: AppShellNavigateDetail | null = null;

function emitPendingNavigationChange(
  detail: AppShellPendingNavigationChangeDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<AppShellPendingNavigationChangeDetail>(
      APP_SHELL_PENDING_NAVIGATION_CHANGE,
      { detail },
    ),
  );
}

export function peekAppShellPendingNavigation(): AppShellNavigateDetail | null {
  return pendingShellNavigation;
}

export function clearAppShellPendingNavigation(): void {
  devDebug("shell-nav", "clearAppShellPendingNavigation");
  pendingShellNavigation = null;
  emitPendingNavigationChange({
    pending: null,
    consumed: null,
    reason: "clear",
  });
}

export function runAppShellPendingNavigation(
  skipLeaveStashOnceRef?: { current: boolean },
): void {
  const detail = pendingShellNavigation;
  pendingShellNavigation = null;
  devDebug("shell-nav", "runAppShellPendingNavigation", {
    consumed: detail,
  });
  traceUserAction("shell-nav", "runAppShellPendingNavigation", {
    target: detail?.target ?? null,
    openFileId8: detail?.openFile?.id.slice(0, 8) ?? null,
  }, "ok");
  emitPendingNavigationChange({
    pending: null,
    consumed: detail,
    reason: "run",
  });
  if (detail?.openFile) {
    const { id, kind } = detail.openFile;
    if (skipLeaveStashOnceRef) {
      skipLeaveStashOnceRef.current = true;
    }
    void openEditorFileTab(
      {
        fileId: id,
        kind,
      },
      {
        getCurrentFileId: () => null,
      },
    );
    return;
  }
  const target = detail?.target ?? "home";
  if (skipLeaveStashOnceRef) {
    skipLeaveStashOnceRef.current = true;
  }
  activateHomeTabWithoutSnapshot({
    buildHomeHash: () => buildViewHash(target),
  });
  window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
}

export function dispatchAppShellNavigate(detail: AppShellNavigateDetail): void {
  devDebug("shell-nav", "dispatchAppShellNavigate", { detail });
  traceUserAction("shell-nav", "dispatchAppShellNavigate", {
    target: detail.target ?? null,
    openFileId8: detail.openFile?.id.slice(0, 8) ?? null,
    openFileKind: detail.openFile?.kind ?? null,
  }, "start");
  window.dispatchEvent(
    new CustomEvent<AppShellNavigateDetail>(APP_SHELL_GO_HOME, { detail }),
  );
}

/**
 * 在调用 forkGoHomeWithServerSave / mindMapGoHomeWithServerSave 之前，
 * 设置「保存/放弃」完成后的 pending 导航（与「文件」按钮共用同一套离开守卫）。
 */
export function applyAppShellPendingNavigation(
  detail: AppShellNavigateDetail | undefined,
  skipLeaveStashOnceRef: { current: boolean },
  assignNavigate: (fn: () => void) => void,
): void {
  pendingShellNavigation = detail ?? null;
  emitPendingNavigationChange({
    pending: pendingShellNavigation,
    consumed: null,
    reason: pendingShellNavigation ? "set" : "clear",
  });
  assignNavigate(() => runAppShellPendingNavigation(skipLeaveStashOnceRef));
}
