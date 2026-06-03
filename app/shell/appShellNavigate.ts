import { recordRecentFileAccess } from "../data/recentFiles";
import { editorRegistry } from "../editors/registry";

import { APP_SHELL_GO_HOME } from "./Sidebar";
import { buildViewHash, type AppView } from "./useAppView";

export type AppShellNavigateDetail = {
  /** 离开编辑器后进入的主页视图（默认 home） */
  target?: Exclude<AppView, "editor">;
  /** 离开编辑器后打开的另一份文档（与文件列表打开同一 hash 规则） */
  openFile?: { id: string; kind: string };
};

let pendingShellNavigation: AppShellNavigateDetail | null = null;

export function peekAppShellPendingNavigation(): AppShellNavigateDetail | null {
  return pendingShellNavigation;
}

export function clearAppShellPendingNavigation(): void {
  pendingShellNavigation = null;
}

export function runAppShellPendingNavigation(
  skipLeaveStashOnceRef?: { current: boolean },
): void {
  const detail = pendingShellNavigation;
  pendingShellNavigation = null;
  if (detail?.openFile) {
    const { id, kind } = detail.openFile;
    if (skipLeaveStashOnceRef) {
      skipLeaveStashOnceRef.current = true;
    }
    recordRecentFileAccess(id);
    window.location.hash = editorRegistry.buildFileHash(id, kind);
    return;
  }
  const target = detail?.target ?? "home";
  if (skipLeaveStashOnceRef) {
    skipLeaveStashOnceRef.current = true;
  }
  window.location.hash = buildViewHash(target);
  window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
}

export function dispatchAppShellNavigate(detail: AppShellNavigateDetail): void {
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
  assignNavigate(() => runAppShellPendingNavigation(skipLeaveStashOnceRef));
}
