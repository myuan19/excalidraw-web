/**
 * Shared host-side phases while opening a document (before / during editor surface ready).
 * Phases are logged to the console (no host loading spinner UI).
 */

import { devDebug } from "./devDebug";

export type EditorOpenPhase =
  | "idle"
  | "shell_chunk"
  | "resolving"
  | "checking_remote"
  | "loading_remote"
  | "restoring_draft"
  | "preparing_surface"
  | "background_sync"
  | "ready";

const PHASE_LABELS: Record<
  Exclude<EditorOpenPhase, "idle" | "ready">,
  string
> = {
  shell_chunk: "正在加载编辑器模块…",
  resolving: "正在打开文档…",
  checking_remote: "正在校验服务器版本…",
  loading_remote: "正在从服务器同步…",
  restoring_draft: "已恢复本地草稿",
  preparing_surface: "正在准备画布…",
  background_sync: "正在与服务器同步…",
};

export function editorOpenPhaseLabel(
  phase: EditorOpenPhase,
): string | null {
  if (phase === "idle" || phase === "ready") {
    return null;
  }
  return PHASE_LABELS[phase] ?? null;
}

let lastLoggedEditorOpenPhase: EditorOpenPhase | null = null;

/** Log open phase to the browser console (dev by default; prod when VITE_APP_ENABLE_EDITOR_OPEN_DEBUG). */
export function logEditorOpenPhase(
  phase: EditorOpenPhase,
  data?: Record<string, unknown>,
): void {
  if (phase === lastLoggedEditorOpenPhase && phase !== "ready") {
    return;
  }
  lastLoggedEditorOpenPhase = phase;
  const label = editorOpenPhaseLabel(phase) ?? phase;
  devDebug("editor-open", label, { phase, ...data });
}

export function resetEditorOpenPhaseLog(): void {
  lastLoggedEditorOpenPhase = null;
}

/** Map legacy bridge status strings to open phases for console logging. */
export function editorOpenPhaseFromBridgeStatus(
  status: string,
): EditorOpenPhase {
  if (status.includes("等待") || status.includes("原生")) {
    return "preparing_surface";
  }
  if (status.includes("已打开")) {
    return "ready";
  }
  if (status.includes("失败")) {
    return "resolving";
  }
  return "resolving";
}

export function shouldOpenCachedDocumentFirst(opts: {
  hasCachedDocument: boolean;
}): boolean {
  return opts.hasCachedDocument;
}

export function shouldFetchServerAfterCachedOpen(opts: {
  hasUnsavedChanges: boolean;
  localServerHash: string | null | undefined;
  remoteServerHash: string | null | undefined;
}): boolean {
  if (opts.hasUnsavedChanges || !opts.remoteServerHash) {
    return false;
  }
  return opts.localServerHash !== opts.remoteServerHash;
}
