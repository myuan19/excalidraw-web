import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("editorHubDesktop", {
  platform: process.platform,
  invokeApi: (request) => ipcRenderer.invoke("editorhub:api", request),
  dragPerf: (payload) => ipcRenderer.invoke("editorhub:dragPerf", payload),
  issueDiag: (payload) => ipcRenderer.invoke("editorhub:issueDiag", payload),
  subscribeCatalogChanges: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => {
      callback(payload ?? {});
    };
    ipcRenderer.on("editorhub:catalog-change", listener);
    return () => {
      ipcRenderer.removeListener("editorhub:catalog-change", listener);
    };
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
  pickFolder: () => ipcRenderer.invoke("desktop:pickFolder"),
  getDefaultDataDirectoryPath: () =>
    ipcRenderer.invoke("desktop:getDefaultDataDirectoryPath"),
  getAppDataDirectoryPath: () =>
    ipcRenderer.invoke("desktop:getAppDataDirectoryPath"),
  consumeOpenDocumentPaths: () =>
    ipcRenderer.invoke("desktop:consumeOpenDocumentPaths"),
  subscribeOpenDocumentPaths: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => {
      const paths = Array.isArray(payload?.paths) ? payload.paths : [];
      callback(paths);
    };
    ipcRenderer.on("editorhub:open-document-paths", listener);
    return () => {
      ipcRenderer.removeListener("editorhub:open-document-paths", listener);
    };
  },
  openPath: (targetPath) => ipcRenderer.invoke("desktop:openPath", targetPath),
  showSaveDialog: (options) =>
    ipcRenderer.invoke("desktop:showSaveDialog", options),
  windowMinimize: () => ipcRenderer.invoke("desktop:windowMinimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("desktop:windowToggleMaximize"),
  windowClose: () => ipcRenderer.invoke("desktop:windowClose"),
  requestWindowClose: () => ipcRenderer.invoke("desktop:requestWindowClose"),
  finishWindowClose: (allow) =>
    ipcRenderer.invoke("desktop:finishWindowClose", { allow }),
  windowIsMaximized: () => ipcRenderer.invoke("desktop:windowIsMaximized"),
  syncShellTheme: (theme) =>
    ipcRenderer.invoke("desktop:syncShellTheme", { theme }),
  onWindowCloseRequested: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = () => {
      callback();
    };
    ipcRenderer.on("desktop:windowCloseRequested", listener);
    return () => {
      ipcRenderer.removeListener("desktop:windowCloseRequested", listener);
    };
  },
  onWindowMaximized: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, maximized) => {
      callback(Boolean(maximized));
    };
    ipcRenderer.on("desktop:windowMaximized", listener);
    return () => {
      ipcRenderer.removeListener("desktop:windowMaximized", listener);
    };
  },
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
