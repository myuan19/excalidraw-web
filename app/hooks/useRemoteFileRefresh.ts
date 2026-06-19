import { useCallback, useEffect, useRef } from "react";

import { onCrossTabFileSaved } from "../data/crossTabFileSync";
import { decideRemoteFileRefresh } from "../data/remoteFileRefreshPolicy";
import { isTabFileDirty } from "../data/tabFileDirtyState";
import { getFileIdFromHash } from "../data/fileIdFromHash";
import { getClientTabId } from "../data/clientRequestContext";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { createLogger } from "../lib/logger";
import { promptServerUpdateConfirm } from "../shell/editorLeaveConfirm";
import {
  beginRemoteUpdatePrompt,
  consumeQueuedRemoteUpdateTarget,
  endRemoteUpdatePrompt,
  queueRemoteUpdateTarget,
  type RemoteUpdateTarget,
} from "../data/fileSyncOperationState";

const log = createLogger({ module: "remoteRefresh" });

function logRemoteRefresh(
  level: "info" | "warn" | "debug",
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  log.event(level, `remote.refresh.${event}`, message, { fields });
}

/**
 * 跨标签自动刷新的接收端编排（两类编辑器共用）。
 *
 * 订阅 file-saved 广播 → 决策：
 * - 本页干净 → 直接执行 reload（带 in-flight 守卫）
 * - 本页有未保存修改 → 平台级确认弹窗，由用户决定
 *
 * 保存方标签收不到自己的广播（BroadcastChannel 语义），无需自我排除。
 */
export function useRemoteFileRefresh(opts: {
  fileId: string | null;
  getDocumentName: () => string;
  /** 编辑器各自的「刷成服务器版本」实现 */
  reload: (target?: RemoteUpdateTarget) => Promise<void>;
  /** 自动刷新成功后的提示（status / toast） */
  onReloaded?: () => void;
}): void {
  const { fileId, getDocumentName, reload, onReloaded } = opts;
  const dismissedShaRef = useRef<string | null>(null);
  const reloadInFlightRef = useRef(false);
  const promptInFlightRef = useRef(false);
  const processTargetRef = useRef<(target: RemoteUpdateTarget) => void>(
    () => {},
  );

  useEffect(() => {
    dismissedShaRef.current = null;
  }, [fileId]);

  const runReload = useCallback(
    async (
      notify: boolean,
      target?: RemoteUpdateTarget,
      opts?: { drainQueued?: boolean },
    ) => {
      if (reloadInFlightRef.current) {
        if (target) {
          queueRemoteUpdateTarget(target);
        }
        logRemoteRefresh(
          "info",
          "reload.queued_in_flight",
          "reload queued: in-flight",
          {
            clientTabId: getClientTabId(),
            fileId8: fileId?.slice(0, 8) ?? null,
            notify,
            targetSha8: target?.contentSha256?.slice(0, 8) ?? null,
            targetVersion: target?.serverVersion ?? null,
          },
        );
        return;
      }
      reloadInFlightRef.current = true;
      logRemoteRefresh("info", "reload.start", "reload start", {
        clientTabId: getClientTabId(),
        fileId8: fileId?.slice(0, 8) ?? null,
        notify,
        targetSha8: target?.contentSha256?.slice(0, 8) ?? null,
        targetVersion: target?.serverVersion ?? null,
      });
      await reload(target)
        .then(() => {
          logRemoteRefresh("info", "reload.done", "reload done", {
            clientTabId: getClientTabId(),
            fileId8: fileId?.slice(0, 8) ?? null,
            notify,
            targetSha8: target?.contentSha256?.slice(0, 8) ?? null,
            targetVersion: target?.serverVersion ?? null,
          });
          if (notify) {
            onReloaded?.();
          }
        })
        .catch((error) => {
          logRemoteRefresh("warn", "reload.failed", "cross-tab reload failed", {
            fileId8: fileId?.slice(0, 8) ?? null,
            message: error?.message || String(error),
          });
        })
        .finally(() => {
          reloadInFlightRef.current = false;
          if (opts?.drainQueued !== false && fileId) {
            const queued = consumeQueuedRemoteUpdateTarget(fileId);
            if (queued) {
              processTargetRef.current(queued);
            }
          }
        });
    },
    [fileId, onReloaded, reload],
  );

  const promptReload = useCallback(
    async (target: RemoteUpdateTarget) => {
      if (!fileId) {
        return;
      }
      const savedSha = target.contentSha256 ?? null;
      if (promptInFlightRef.current) {
        queueRemoteUpdateTarget(target);
        logRemoteRefresh(
          "info",
          "prompt.queued_in_flight",
          "prompt queued: in-flight",
          {
            clientTabId: getClientTabId(),
            fileId8: fileId?.slice(0, 8) ?? null,
            savedSha8: savedSha?.slice(0, 8) ?? null,
            serverVersion: target.serverVersion ?? null,
          },
        );
        return;
      }
      const token = beginRemoteUpdatePrompt(target);
      promptInFlightRef.current = true;
      try {
        logRemoteRefresh("info", "prompt.start", "prompt start", {
          clientTabId: getClientTabId(),
          fileId8: fileId?.slice(0, 8) ?? null,
          savedSha8: savedSha?.slice(0, 8) ?? null,
          serverVersion: target.serverVersion ?? null,
          documentName: getDocumentName(),
        });
        const choice = await promptServerUpdateConfirm({
          documentName: getDocumentName(),
          serverVersion: target.serverVersion ?? null,
          mode: "remote-update",
        });
        logRemoteRefresh("info", "prompt.choice", "prompt choice", {
          clientTabId: getClientTabId(),
          fileId8: fileId?.slice(0, 8) ?? null,
          savedSha8: savedSha?.slice(0, 8) ?? null,
          serverVersion: target.serverVersion ?? null,
          choice,
        });
        if (choice === "load-remote") {
          dismissedShaRef.current = null;
          const queued = consumeQueuedRemoteUpdateTarget(fileId);
          const targetToLoad = queued ?? target;
          if (queued) {
            logRemoteRefresh(
              "info",
              "prompt.choice_promoted_target",
              "prompt choice promoted queued target",
              {
                clientTabId: getClientTabId(),
                fileId8: fileId.slice(0, 8),
                oldSha8: savedSha?.slice(0, 8) ?? null,
                oldVersion: target.serverVersion ?? null,
                targetSha8: queued.contentSha256?.slice(0, 8) ?? null,
                targetVersion: queued.serverVersion ?? null,
              },
            );
          }
          await runReload(false, targetToLoad, { drainQueued: false });
          return;
        }
        dismissedShaRef.current = savedSha;
      } finally {
        promptInFlightRef.current = false;
        endRemoteUpdatePrompt(token);
        const queued = consumeQueuedRemoteUpdateTarget(fileId);
        if (queued) {
          processTargetRef.current(queued);
        }
      }
    },
    [fileId, getDocumentName, runReload],
  );

  const processRemoteTarget = useCallback(
    (target: RemoteUpdateTarget) => {
      const currentFileId = getFileIdFromHash();
      const tabHasUnsavedChanges = isTabFileDirty(fileId);
      const decision = decideRemoteFileRefresh({
        currentFileId,
        savedFileId: target.fileId,
        tabHasUnsavedChanges,
        savedSha: target.contentSha256 ?? null,
        dismissedSha: dismissedShaRef.current,
      });
      logRemoteRefresh(
        "info",
        "cross_tab.decision",
        "cross-tab file-saved decision",
        {
          clientTabId: getClientTabId(),
          decision,
          fileId8: fileId?.slice(0, 8) ?? null,
          currentFileId8: currentFileId?.slice(0, 8) ?? null,
          savedFileId8: target.fileId.slice(0, 8),
          sha8: target.contentSha256?.slice(0, 8) ?? null,
          serverVersion: target.serverVersion ?? null,
          dismissedSha8: dismissedShaRef.current?.slice(0, 8) ?? null,
          tabHasUnsavedChanges,
        },
      );
      if (decision === "ignore") {
        return;
      }
      if (promptInFlightRef.current || reloadInFlightRef.current) {
        queueRemoteUpdateTarget(target);
        logRemoteRefresh("info", "target.queued_busy", "target queued: busy", {
          clientTabId: getClientTabId(),
          fileId8: fileId?.slice(0, 8) ?? null,
          decision,
          promptInFlight: promptInFlightRef.current,
          reloadInFlight: reloadInFlightRef.current,
          targetSha8: target.contentSha256?.slice(0, 8) ?? null,
          targetVersion: target.serverVersion ?? null,
        });
        return;
      }
      if (decision === "prompt") {
        void promptReload(target);
        return;
      }
      void runReload(true, target);
    },
    [fileId, promptReload, runReload],
  );

  useEffect(() => {
    processTargetRef.current = processRemoteTarget;
  }, [processRemoteTarget]);

  useEffect(() => {
    if (!fileId || isLocalDraftFileId(fileId)) {
      return;
    }
    return onCrossTabFileSaved((savedFileId, contentSha256, payload) => {
      const target: RemoteUpdateTarget = {
        fileId: savedFileId,
        contentSha256,
        serverVersion: payload.version,
        source: "cross-tab",
      };
      processRemoteTarget(target);
    });
  }, [fileId, processRemoteTarget]);
}
