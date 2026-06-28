/**
 * Desktop: OS file association / double-click → same flow as recent view「打开」.
 * Track in recent, open editor immediately, generate thumbnails in background.
 */
export function bindDesktopOpenDocumentPaths(
  handler: (absPaths: string[]) => void,
): () => void {
  const desktop = window.editorHubDesktop;
  if (!desktop?.subscribeOpenDocumentPaths) {
    return () => {};
  }

  const onPaths = (paths: string[]) => {
    const normalized = paths
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    if (normalized.length > 0) {
      handler(normalized);
    }
  };

  const unsubscribe = desktop.subscribeOpenDocumentPaths(onPaths);

  void desktop.consumeOpenDocumentPaths?.().then((paths) => {
    if (paths?.length) {
      onPaths(paths);
    }
  });

  return unsubscribe;
}
