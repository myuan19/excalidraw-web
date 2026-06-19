import { LocalDraftSessions } from "./localDraftSessions";

export function getLocalDraftDisplayName(fileId: string): string {
  return LocalDraftSessions.get(fileId)?.name?.trim() || "未命名";
}
