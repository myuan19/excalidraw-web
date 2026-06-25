import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { LocalDraftSessions } from "./localDraftSessions";

export function getLocalDraftDisplayName(fileId: string): string {
  return (
    LocalDraftSessions.get(fileId)?.name?.trim() ||
    DEFAULT_DOCUMENT_DISPLAY_NAME
  );
}
