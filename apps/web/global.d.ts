import "@excalidraw/excalidraw/global";
import "@excalidraw/excalidraw/css";

declare global {
  interface Window {
    __EXCALIDRAW_SHA__: string | undefined;
    editorHubDesktop?: {
      platform: string;
      invokeApi?: (request: {
        method?: string;
        path: string;
        headers?: Record<string, string>;
        body?: string | null;
      }) => Promise<{
        status: number;
        headers: Record<string, string>;
        bodyText: string;
      }>;
      dragPerf?: (payload: {
        phase: "start" | "end";
        sessionId?: number;
        reason?: string;
        raf?: Record<string, unknown> | null;
      }) => Promise<{ ok: boolean }>;
      issueDiag?: (payload: {
        area: string;
        action: string;
        phase?: string;
        data?: Record<string, unknown>;
      }) => Promise<{ ok: boolean; reason?: string }>;
      subscribeCatalogChanges?: (
        callback: (payload: Record<string, unknown>) => void,
      ) => () => void;
      pickFolder?: () => Promise<string | null>;
      getDefaultDataDirectoryPath?: () => Promise<string | null>;
      getAppDataDirectoryPath?: () => Promise<string | null>;
      consumeOpenDocumentPaths?: () => Promise<string[]>;
      subscribeOpenDocumentPaths?: (
        callback: (paths: string[]) => void,
      ) => () => void;
      openPath?: (targetPath: string) => Promise<string>;
      showSaveDialog?: (options?: {
        title?: string;
        defaultName?: string;
        extension?: string;
      }) => Promise<string | null>;
      getPathForFile?: (file: File) => string;
      windowMinimize?: () => Promise<void>;
      windowToggleMaximize?: () => Promise<boolean>;
      windowClose?: () => Promise<void>;
      requestWindowClose?: () => Promise<void>;
      finishWindowClose?: (allow: boolean) => Promise<boolean>;
      windowIsMaximized?: () => Promise<boolean>;
      syncShellTheme?: (theme: "light" | "dark") => Promise<{ ok: boolean }>;
      onWindowCloseRequested?: (callback: () => void) => () => void;
      onWindowMaximized?: (callback: (maximized: boolean) => void) => () => void;
      versions?: {
        chrome?: string;
        electron?: string;
        node?: string;
      };
    };
  }
}
