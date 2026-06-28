import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDesktopArgs } from "./config.mjs";
import { listenDesktopServer } from "./bootstrapServer.mjs";
import {
  applyDesktopServerLogEnv,
  configureDesktopLogPaths,
  getDesktopOpLogPath,
  writeDesktopLog,
} from "./desktopLogger.mjs";
import {
  resolveAppDataDir,
  resolveAppLogsDir,
} from "./desktopPaths.mjs";

const config = parseDesktopArgs();
process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const mockApp = {
  getPath: (name) => {
    if (name === "userData") {
      return config.workspacePath;
    }
    throw new Error(`unexpected getPath: ${name}`);
  },
};
const logDir =
  process.env.EDITORHUB_DESKTOP_LOG_DIR?.trim() ||
  resolveAppLogsDir(mockApp);
const dataDir =
  process.env.EXCALIDRAW_DATA_DIR?.trim() || resolveAppDataDir(mockApp);
mkdirSync(logDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
configureDesktopLogPaths(() => [logDir]);
applyDesktopServerLogEnv({ dataDir, logDir });

writeDesktopLog("server", "cli-start", {
  workspacePath: config.workspacePath,
  appBuildPath: config.appBuildPath,
  logPath: getDesktopOpLogPath(),
});

const { url } = await listenDesktopServer(config);

/* eslint-disable no-console -- CLI bootstrap prints connection details for the desktop shell. */
console.log(`EditorHub desktop server: ${url}`);
console.log(`Workspace: ${config.workspacePath}`);
console.log(`App build: ${config.appBuildPath}`);
console.log(`Desktop op log: ${getDesktopOpLogPath() ?? "(unknown)"}`);
console.log(`Server file log dir: ${process.env.EXCALIDRAW_LOG_DIR ?? "(disabled)"}`);
/* eslint-enable no-console */
