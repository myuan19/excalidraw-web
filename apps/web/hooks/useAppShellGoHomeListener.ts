import { useCallback, useEffect, useRef } from "react";

import {
  resolveEditorHomeNavPlan,
  shouldDeferLeaveWhileNewDocumentHash,
} from "../data/editorLeaveHome";
import { getFileIdFromHash } from "../data/fileIdFromHash";
import { getDocumentKindFromHash } from "../lib/appBranding";
import { devDebug } from "../lib/devDebug";
import { APP_SHELL_GO_HOME } from "../shell/Sidebar";
import {
  applyAppShellPendingNavigation,
  clearAppShellPendingNavigation,
  type AppShellNavigateDetail,
} from "../shell/appShellNavigate";
import { confirmEditorLeaveForFile } from "../shell/editorLeaveFlow";

/**
 * 监听侧栏「文件 / 最近」导航：此前只 dispatch 事件、无消费者，导致点击无反应。
 */
export function useAppShellGoHomeListener() {
  const skipLeaveStashOnceRef = useRef(false);
  const pendingNavigateRef = useRef<(() => void) | null>(null);

  const runPendingNavigate = useCallback(() => {
    const navigate = pendingNavigateRef.current;
    pendingNavigateRef.current = null;
    devDebug("shell-nav", "runPendingNavigate", { hasNavigate: !!navigate });
    navigate?.();
  }, []);

  const cancelPendingNavigate = useCallback(() => {
    clearAppShellPendingNavigation();
    pendingNavigateRef.current = null;
  }, []);

  useEffect(() => {
    const onGoHome = (event: Event) => {
      const detail = (event as CustomEvent<AppShellNavigateDetail>).detail;
      const fileId = getFileIdFromHash();
      const kind = getDocumentKindFromHash();
      devDebug("shell-nav", "APP_SHELL_GO_HOME | received", {
        detail,
        hash: window.location.hash,
        fileId8: fileId?.slice(0, 20) ?? null,
        kind,
      });

      if (shouldDeferLeaveWhileNewDocumentHash(fileId, window.location.hash)) {
        devDebug("shell-nav", "APP_SHELL_GO_HOME | deferred new-document hash");
        return;
      }

      applyAppShellPendingNavigation(
        detail,
        skipLeaveStashOnceRef,
        (navigate) => {
          pendingNavigateRef.current = navigate;

          if (!fileId) {
            runPendingNavigate();
            return;
          }

          const plan = resolveEditorHomeNavPlan(fileId, { kind });
          devDebug("shell-nav", "APP_SHELL_GO_HOME | plan", {
            fileId8: fileId.slice(0, 8),
            action: plan.action,
          });

          if (plan.action === "prompt-leave") {
            void confirmEditorLeaveForFile(fileId, { kind })
              .then((ok) => {
                if (ok) {
                  runPendingNavigate();
                } else {
                  cancelPendingNavigate();
                }
              })
              .catch((error) => {
                devDebug("shell-nav", "APP_SHELL_GO_HOME | leave failed", {
                  message:
                    error instanceof Error ? error.message : String(error),
                });
                cancelPendingNavigate();
              });
            return;
          }

          runPendingNavigate();
        },
      );
    };

    window.addEventListener(APP_SHELL_GO_HOME, onGoHome);
    devDebug("shell-nav", "listener registered");
    return () => {
      window.removeEventListener(APP_SHELL_GO_HOME, onGoHome);
      devDebug("shell-nav", "listener unregistered");
    };
  }, [cancelPendingNavigate, runPendingNavigate]);
}
