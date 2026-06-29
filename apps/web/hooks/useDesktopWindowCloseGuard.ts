import { useEffect, useRef } from "react";

import { prepareDesktopWindowClose } from "../data/editorTabLeave";
import { devDebug } from "../lib/devDebug";
import { traceIssueDiag } from "../lib/issueDiagTrace";
import { isDesktopEditorHub } from "../lib/runtimePlatform";

/**
 * 拦截 Electron 系统级关窗（标题栏 X、Alt+F4、任务栏关闭等），
 * 在真正关闭前先走与标签关闭相同的保存流程。
 */
const WINDOW_CLOSE_PREPARE_TIMEOUT_MS = 30_000;

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
      const prepare = prepareDesktopWindowClose();
      const timeout = new Promise<boolean>((resolve) => {
        window.setTimeout(() => {
          traceIssueDiag(
            "desktop.close",
            "window.prepare",
            {
              generation,
              reason: "renderer-timeout",
              totalMs: Math.round(performance.now() - requestedAt),
            },
            "fail",
          );
          devDebug("shell-nav", "desktop window close prepare timed out", {
            generation,
          });
          resolve(true);
        }, WINDOW_CLOSE_PREPARE_TIMEOUT_MS);
      });
      void Promise.race([prepare, timeout])
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
          traceIssueDiag(
            "desktop.close",
            "window.prepare",
            {
              generation,
              allow,
              totalMs: Math.round(performance.now() - requestedAt),
            },
            allow ? "ok" : "fail",
          );
          devDebug("shell-nav", "desktop window close prepare done", { allow });
          void api.finishWindowClose?.(allow);
        })
        .catch((error) => {
          if (generation !== prepareGenerationRef.current) {
            traceIssueDiag(
              "desktop.close",
              "window.prepare",
              {
                generation,
                currentGeneration: prepareGenerationRef.current,
                reason: "abandoned-after-error",
                totalMs: Math.round(performance.now() - requestedAt),
              },
              "fail",
            );
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
