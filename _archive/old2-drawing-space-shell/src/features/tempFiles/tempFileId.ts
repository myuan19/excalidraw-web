const TEMP_PREFIX = "local-temp:";

export function createLocalTempFileId(): string {
  return `${TEMP_PREFIX}${crypto.randomUUID()}`;
}

export function isLocalTempFileId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}
