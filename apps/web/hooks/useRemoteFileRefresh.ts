import { useCallback, useEffect, useRef, useState } from "react";

import { onCrossTabFileSaved } from "../data/crossTabFileSync";
import { decideRemoteFileRefresh } from "../data/remoteFileRefreshPolicy";
import { isTabFileDirty } from "../data/tabFileDirtyState";
import { getFileIdFromHash } from "../data/fileIdFromHash";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "remoteRefresh" });

export type RemoteFileRefreshControls = {
  /** 本页有未保存修改且服务器有新版本时，确认弹窗是否打开 */
  promptOpen: boolean;
  /** 用户选择「加载新版本」：放弃本页修改，刷成服务器版 */
  confirmReload: () => void;
  /** 用户选择「保留当前修改」：同一版本不再提示 */
  dismissPrompt: () => void;
};

/**
 * 跨标签自动刷新的接收端编排（两类编辑器共用）。
 *
 * 订阅 file-saved 广播 → 决策：
 * - 本页干净 → 直接执行 reload（带 in-flight 守卫）
 * - 本页有未保存修改 → 打开确认弹窗，由用户决定
 *
 * 保存方标签收不到自己的广播（BroadcastChannel 语义），无需自我排除。
 */
export function useRemoteFileRefresh(opts: {
  fileId: string | null;
  /** 编辑器各自的「刷成服务器版本」实现 */
  reload: () => Promise<void>;
  /** 自动刷新成功后的提示（status / toast） */
  onReloaded?: () => void;
}): RemoteFileRefreshControls {
  const { fileId, reload, onReloaded } = opts;
  const [promptOpen, setPromptOpen] = useState(false);
  const promptShaRef = useRef<string | null>(null);
  const dismissedShaRef = useRef<string | null>(null);
  const reloadInFlightRef = useRef(false);

  useEffect(() => {
    setPromptOpen(false);
    promptShaRef.current = null;
    dismissedShaRef.current = null;
  }, [fileId]);

  const runReload = useCallback(
    (notify: boolean) => {
      if (reloadInFlightRef.current) {
        return;
      }
      reloadInFlightRef.current = true;
      void reload()
        .then(() => {
          if (notify) {
            onReloaded?.();
          }
        })
        .catch((error) => {
          log.warn("cross-tab reload failed", {
            fileId8: fileId?.slice(0, 8) ?? null,
            message: error?.message || String(error),
          });
        })
        .finally(() => {
          reloadInFlightRef.current = false;
        });
    },
    [fileId, onReloaded, reload],
  );

  useEffect(() => {
    if (!fileId || isLocalDraftFileId(fileId)) {
      return;
    }
    return onCrossTabFileSaved((savedFileId, contentSha256) => {
      const decision = decideRemoteFileRefresh({
        currentFileId: getFileIdFromHash(),
        savedFileId,
        tabHasUnsavedChanges: isTabFileDirty(fileId),
        savedSha: contentSha256,
        dismissedSha: dismissedShaRef.current,
      });
      log.debug("cross-tab file-saved decision", {
        decision,
        fileId8: fileId.slice(0, 8),
        savedFileId8: savedFileId.slice(0, 8),
        sha8: contentSha256?.slice(0, 8) ?? null,
      });
      if (decision === "ignore") {
        return;
      }
      if (decision === "prompt") {
        promptShaRef.current = contentSha256;
        setPromptOpen(true);
        return;
      }
      runReload(true);
    });
  }, [fileId, runReload]);

  const confirmReload = useCallback(() => {
    setPromptOpen(false);
    promptShaRef.current = null;
    dismissedShaRef.current = null;
    runReload(false);
  }, [runReload]);

  const dismissPrompt = useCallback(() => {
    dismissedShaRef.current = promptShaRef.current;
    promptShaRef.current = null;
    setPromptOpen(false);
  }, []);

  return { promptOpen, confirmReload, dismissPrompt };
}
