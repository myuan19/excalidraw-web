import {
  requestEditorTabDiscard,
  requestEditorTabSave,
} from "../data/activeEditorSaveBridge";
import { discardLocalDraftSession } from "../data/discardLocalDraftSession";
import {
  resolveEditorHomeNavPlan,
  shouldNavigateAfterExitSave,
} from "../data/editorLeaveHome";
import { isAutoSaveOnExitActive } from "../data/appSettings";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { editorRegistry } from "../editors/registry";
import { traceIssueDiag } from "../lib/issueDiagTrace";

import { promptLeaveEditorConfirm } from "./editorLeaveConfirm";

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export function resolveEditorLeaveContentLabel(
  kind: string | null | undefined,
): "画布" | "mindmap" {
  return editorRegistry.resolveKind(kind) === "mindmap" ? "mindmap" : "画布";
}

/**
 * 离开编辑器前的统一确认（顶部 ×、侧栏关闭、文件/最近导航共用）。
 * 返回 true 表示可继续关闭/导航；false 表示用户取消或保存未完成。
 */
export async function confirmEditorLeaveForFile(
  fileId: string,
  opts: { kind?: string | null } = {},
): Promise<boolean> {
  const totalStartedAt = performance.now();
  const kind = opts.kind ?? null;
  const plan = resolveEditorHomeNavPlan(fileId, { kind });
  if (plan.action !== "prompt-leave") {
    traceIssueDiag(
      "desktop.close",
      "leave.confirm",
      {
        fileId8: fileId.slice(0, 8),
        kind: editorRegistry.resolveKind(kind),
        branch: "no-prompt",
        totalMs: elapsedMs(totalStartedAt),
      },
      "ok",
    );
    return true;
  }

  if (isAutoSaveOnExitActive() && !isLocalDraftFileId(fileId)) {
    const saveStartedAt = performance.now();
    const saved = await requestEditorTabSave(fileId, "exit");
    const ok = shouldNavigateAfterExitSave(saved, fileId, kind);
    traceIssueDiag(
      "desktop.close",
      "leave.confirm",
      {
        fileId8: fileId.slice(0, 8),
        kind: editorRegistry.resolveKind(kind),
        branch: "auto-save-exit",
        saved,
        ok,
        saveMs: elapsedMs(saveStartedAt),
        totalMs: elapsedMs(totalStartedAt),
      },
      ok ? "ok" : "fail",
    );
    return ok;
  }

  const promptStartedAt = performance.now();
  const choice = await promptLeaveEditorConfirm({
    contentLabel: resolveEditorLeaveContentLabel(kind),
    reason: isLocalDraftFileId(fileId)
      ? "local-draft-not-saved"
      : "unsaved-edits",
  });
  const promptMs = elapsedMs(promptStartedAt);
  if (choice === "cancel") {
    traceIssueDiag(
      "desktop.close",
      "leave.confirm",
      {
        fileId8: fileId.slice(0, 8),
        kind: editorRegistry.resolveKind(kind),
        branch: "prompt",
        choice,
        promptMs,
        totalMs: elapsedMs(totalStartedAt),
      },
      "fail",
    );
    return false;
  }
  if (choice === "discard") {
    const discardStartedAt = performance.now();
    if (isLocalDraftFileId(fileId)) {
      await discardLocalDraftSession(fileId);
      traceIssueDiag(
        "desktop.close",
        "leave.confirm",
        {
          fileId8: fileId.slice(0, 8),
          kind: editorRegistry.resolveKind(kind),
          branch: "prompt",
          choice,
          promptMs,
          discardMs: elapsedMs(discardStartedAt),
          totalMs: elapsedMs(totalStartedAt),
        },
        "ok",
      );
      return true;
    }
    await requestEditorTabDiscard(fileId);
    traceIssueDiag(
      "desktop.close",
      "leave.confirm",
      {
        fileId8: fileId.slice(0, 8),
        kind: editorRegistry.resolveKind(kind),
        branch: "prompt",
        choice,
        promptMs,
        discardMs: elapsedMs(discardStartedAt),
        totalMs: elapsedMs(totalStartedAt),
      },
      "ok",
    );
    return true;
  }

  const saveStartedAt = performance.now();
  const saved = await requestEditorTabSave(fileId, "exit");
  const ok = shouldNavigateAfterExitSave(saved, fileId, kind);
  traceIssueDiag(
    "desktop.close",
    "leave.confirm",
    {
      fileId8: fileId.slice(0, 8),
      kind: editorRegistry.resolveKind(kind),
      branch: "prompt",
      choice,
      saved,
      ok,
      promptMs,
      saveMs: elapsedMs(saveStartedAt),
      totalMs: elapsedMs(totalStartedAt),
    },
    ok ? "ok" : "fail",
  );
  return ok;
}
