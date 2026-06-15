import { mkdirSync } from "node:fs";
import path from "node:path";

import { parseDesktopArgs } from "./config.mjs";
import { listenDesktopServer } from "./bootstrapServer.mjs";
import {
  applyDesktopServerLogEnv,
  configureDesktopLogPaths,
  getDesktopOpLogPath,
  writeDesktopLog,
} from "./desktopLogger.mjs";

const config = parseDesktopArgs();
const logDir =
  process.env.EDITORHUB_DESKTOP_LOG_DIR?.trim() ||
  path.join(config.workspacePath, ".editorhub", "logs");
const dataDir =
  process.env.EXCALIDRAW_DATA_DIR?.trim() ||
  path.join(config.workspacePath, ".editorhub", "server-data");
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
