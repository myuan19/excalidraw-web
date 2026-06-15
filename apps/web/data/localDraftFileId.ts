const DRAFT_PREFIX = "local-draft:";

export function createLocalDraftFileId(): string {
  return `${DRAFT_PREFIX}${crypto.randomUUID()}`;
}

export function isLocalDraftFileId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}
