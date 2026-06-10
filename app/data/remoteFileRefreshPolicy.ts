export type RemoteFileRefreshDecision = "ignore" | "reload" | "conflict";

export function decideRemoteFileRefresh(opts: {
  currentFileId: string | null | undefined;
  savedFileId: string | null | undefined;
  hasUnsavedChanges: boolean;
  localServerHash?: string | null;
  remoteHash?: string | null;
}): RemoteFileRefreshDecision {
  if (!opts.currentFileId || opts.currentFileId !== opts.savedFileId) {
    return "ignore";
  }
  if (opts.hasUnsavedChanges) {
    return "conflict";
  }
  if (!opts.remoteHash || !opts.localServerHash) {
    return "reload";
  }
  return opts.localServerHash === opts.remoteHash ? "ignore" : "reload";
}
