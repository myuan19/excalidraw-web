import { useEffect, useRef } from "react";

import {
  isIdleAutoSaveActive,
  subscribeAppSettings,
} from "../data/appSettings";
import {
  rearmIdleAutoSaveIfNeeded,
  shouldRearmIdleAutoSave,
  type IdleAutoSaveRearmOpts,
} from "../data/autoSaveSession";
import { isLocalDraftFileId } from "../data/localDraftFileId";

export type UseIdleAutoSaveRearmOptions = IdleAutoSaveRearmOpts & {
  /** 空闲自动保存被关闭时清理编辑器自有计时器（如 MindMap saveTimerRef）。 */
  onIdleDisabled?: () => void;
  /** 在读取 FileSyncState dirty 状态前，先 flush 编辑器自己的防抖草稿指纹。 */
  beforeDirtyCheck?: () => void;
  /** 额外 rearm 信号，例如 cached pane 从后台切回前台。 */
  rearmKey?: unknown;
};

/**
 * 设置变更或 Tab 重新激活时，在「当前活跃文件 + 有未保存内容」条件下重新排队空闲保存。
 * 无 onRearm 时走全局 idle 计时器（Excalidraw）；有 onRearm 时由编辑器自行排队（MindMap）。
 */
export function useIdleAutoSaveRearm(
  fileId: string | null | undefined,
  isEditorTabActive: boolean,
  onRearm?: () => void,
  options?: UseIdleAutoSaveRearmOptions,
): void {
  const onRearmRef = useRef(onRearm);
  onRearmRef.current = onRearm;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const rearmKey = options?.rearmKey;

  useEffect(() => {
    if (!fileId || isLocalDraftFileId(fileId)) {
      return;
    }

    const tryRearm = () => {
      if (!isEditorTabActive) {
        return;
      }
      const opts = optionsRef.current;
      opts?.beforeDirtyCheck?.();
      if (!shouldRearmIdleAutoSave(fileId, opts)) {
        return;
      }
      if (onRearmRef.current) {
        onRearmRef.current();
        return;
      }
      rearmIdleAutoSaveIfNeeded(fileId, opts);
    };

    const unsubSettings = subscribeAppSettings(() => {
      if (!isIdleAutoSaveActive()) {
        optionsRef.current?.onIdleDisabled?.();
        return;
      }
      tryRearm();
    });

    const onVisibilityChange = () => {
      if (!document.hidden) {
        tryRearm();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubSettings();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fileId, isEditorTabActive]);

  useEffect(() => {
    if (!fileId || isLocalDraftFileId(fileId) || !isEditorTabActive) {
      return;
    }
    const opts = optionsRef.current;
    opts?.beforeDirtyCheck?.();
    if (!shouldRearmIdleAutoSave(fileId, opts)) {
      return;
    }
    if (onRearmRef.current) {
      onRearmRef.current();
      return;
    }
    rearmIdleAutoSaveIfNeeded(fileId, opts);
  }, [isEditorTabActive, fileId, rearmKey]);
}
