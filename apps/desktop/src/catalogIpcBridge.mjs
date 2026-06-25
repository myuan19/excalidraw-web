/**
 * Push catalog change events from the folder-mapping watcher to renderer IPC.
 */
export function attachCatalogIpcBridge(catalogWatcher, getWebContents) {
  if (!catalogWatcher?.onChange) {
    return { detach: () => {} };
  }

  const detach = catalogWatcher.onChange((payload) => {
    const contents = getWebContents();
    if (!contents || contents.isDestroyed()) {
      return;
    }
    contents.send("editorhub:catalog-change", payload ?? {});
  });

  return { detach };
}
