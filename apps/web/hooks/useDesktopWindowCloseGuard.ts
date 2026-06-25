import { useEffect, useRef } from "react";

import { prepareAllOpenEditorTabsForClose } from "../data/editorTabLeave";
import { devDebug } from "../lib/devDebug";
import { isDesktopEditorHub } from "../lib/runtimePlatform";

/**
 * 拦截 Electron 系统级关窗（标题栏 X、Alt+F4、任务栏关闭等），
 * 在真正关闭前先走与标签关闭相同的保存流程。
 */
export function useDesktopWindowCloseGuard() {
  const prepareInFlightRef = useRef(false);

  useEffect(() => {
    if (!isDesktopEditorHub()) {
      return;
    }
    const api = window.editorHubDesktop;
    if (!api?.onWindowCloseRequested || !api?.finishWindowClose) {
      devDebug("shell-nav", "desktop window close guard skipped — IPC missing");
      return;
    }

    devDebug("shell-nav", "desktop window close guard registered");
    return api.onWindowCloseRequested(() => {
      if (prepareInFlightRef.current) {
        devDebug("shell-nav", "desktop window close ignored — prepare in flight");
        return;
      }
      prepareInFlightRef.current = true;
      devDebug("shell-nav", "desktop window close requested — preparing tabs");
      void prepareAllOpenEditorTabsForClose()
        .then((allow) => {
          devDebug("shell-nav", "desktop window close prepare done", { allow });
          void api.finishWindowClose?.(allow);
        })
        .catch((error) => {
          devDebug("shell-nav", "desktop window close prepare failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          void api.finishWindowClose?.(false);
        })
        .finally(() => {
          prepareInFlightRef.current = false;
        });
    });
  }, []);
}
