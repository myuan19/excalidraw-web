export function shouldOpenCachedMindMapFirst(opts: {
  hasCachedDocument: boolean;
}): boolean {
  return opts.hasCachedDocument;
}

export function shouldFetchServerAfterCachedMindMapOpen(opts: {
  hasUnsavedChanges: boolean;
  localServerHash: string | null | undefined;
  remoteServerHash: string | null | undefined;
}): boolean {
  if (opts.hasUnsavedChanges || !opts.remoteServerHash) {
    return false;
  }
  return opts.localServerHash !== opts.remoteServerHash;
}
