import { useEffect, useRef } from "react";

import { snapshotDesktopWindowCloseSession } from "../data/desktopWindowCloseSession";
import { prepareDesktopWindowClose } from "../data/editorTabLeave";
import { devDebug } from "../lib/devDebug";
import { traceIssueDiag } from "../lib/issueDiagTrace";
import { isDesktopEditorHub } from "../lib/runtimePlatform";

let closePreparePromise: Promise<boolean> | null = null;

function runDesktopClosePrepare(): Promise<boolean> {
  if (!closePreparePromise) {
    closePreparePromise = prepareDesktopWindowClose().finally(() => {
      closePreparePromise = null;
    });
  }
  return closePreparePromise;
}

/**
 * 拦截 Electron 系统级关窗（标题栏 X、Alt+F4、任务栏关闭等）。
 * 等待 prepareDesktopWindowClose 内各 tab 保存状态全部 settled 后再 finishWindowClose。
 */
export function useDesktopWindowCloseGuard() {
  const prepareGenerationRef = useRef(0);

  useEffect(() => {
    if (!isDesktopEditorHub()) {
      return;
    }
    const api = window.editorHubDesktop;
    if (!api?.onWindowCloseRequested || !api?.finishWindowClose) {
      devDebug("shell-nav", "desktop window close guard skipped — IPC missing");
      return;
    }

    traceIssueDiag("desktop.close", "guard.registered", {}, "ok");
    devDebug("shell-nav", "desktop window close guard registered");

    return api.onWindowCloseRequested(() => {
      const requestedAt = performance.now();
      const generation = ++prepareGenerationRef.current;
      traceIssueDiag(
        "desktop.close",
        "window.prepare",
        { generation },
        "start",
      );
      devDebug("shell-nav", "desktop window close requested — preparing tabs", {
        generation,
      });

      void runDesktopClosePrepare()
        .then((allow) => {
          if (generation !== prepareGenerationRef.current) {
            traceIssueDiag(
              "desktop.close",
              "window.prepare",
              {
                generation,
                currentGeneration: prepareGenerationRef.current,
                reason: "abandoned-by-new-close-request",
                totalMs: Math.round(performance.now() - requestedAt),
              },
              "fail",
            );
            return;
          }
          const snapshot = snapshotDesktopWindowCloseSession();
          traceIssueDiag(
            "desktop.close",
            "window.prepare",
            {
              generation,
              allow,
              totalMs: Math.round(performance.now() - requestedAt),
              snapshot,
            },
            allow ? "ok" : "fail",
          );
          devDebug("shell-nav", "desktop window close prepare done", {
            allow,
            snapshot,
          });
          void api.finishWindowClose?.(allow);
        })
        .catch((error) => {
          if (generation !== prepareGenerationRef.current) {
            return;
          }
          traceIssueDiag(
            "desktop.close",
            "window.prepare",
            {
              generation,
              reason: "prepare-error",
              message: error instanceof Error ? error.message : String(error),
              totalMs: Math.round(performance.now() - requestedAt),
            },
            "fail",
          );
          devDebug("shell-nav", "desktop window close prepare failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          void api.finishWindowClose?.(true);
        });
    });
  }, []);
}
