import type { LocalDraft } from "./LocalDraftStorage";

export type OpenPayloadSource = "server" | "draft";

export interface ResolveOpenPayloadInput {
  fileName: string;
  serverDataText: string;
  serverHash: string | null;
  draft: LocalDraft | null;
  hasServerChanged: boolean;
  confirmChoice(message: string): boolean;
}

export interface ResolveOpenPayloadResult {
  dataText: string;
  source: OpenPayloadSource;
  clearDraft: boolean;
}

export function resolveOpenPayload(input: ResolveOpenPayloadInput): ResolveOpenPayloadResult {
  const hasNewerDraft = !!input.draft && input.draft.hash !== input.serverHash;
  if (!hasNewerDraft || !input.draft) {
    return { dataText: input.serverDataText, source: "server", clearDraft: false };
  }

  const useDraft = input.confirmChoice(
    input.hasServerChanged
      ? `检测到「${input.fileName}」存在未保存本地草稿，同时服务器版本也发生了变化。\n\n选择“确定”将恢复本地草稿；选择“取消”将打开服务器版本并清理本地草稿。`
      : `检测到「${input.fileName}」存在未保存本地草稿，是否恢复草稿？\n\n选择“取消”将打开服务端版本并清理该草稿。`,
  );

  return useDraft
    ? { dataText: input.draft.data, source: "draft", clearDraft: false }
    : { dataText: input.serverDataText, source: "server", clearDraft: true };
}
