import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

export function parseDesktopArgs(argv = process.argv.slice(2), defaults = {}) {
  const projectRoot = defaults.projectRoot || PROJECT_ROOT;
  const config = {
    host: process.env.DESKTOP_HOST || defaults.host || "127.0.0.1",
    port: Number(process.env.DESKTOP_PORT || process.env.PORT || defaults.port || 3033),
    workspacePath:
      process.env.EDITORHUB_DESKTOP_WORKSPACE || defaults.workspacePath || "",
    appBuildPath:
      process.env.EDITORHUB_DESKTOP_APP_BUILD ||
      defaults.appBuildPath ||
      path.join(projectRoot, "apps/web/build"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace") {
      config.workspacePath = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--workspace=")) {
      config.workspacePath = arg.slice("--workspace=".length);
    } else if (arg === "--port") {
      config.port = Number(argv[index + 1] || config.port);
      index += 1;
    } else if (arg.startsWith("--port=")) {
      config.port = Number(arg.slice("--port=".length));
    } else if (arg === "--host") {
      config.host = argv[index + 1] || config.host;
      index += 1;
    } else if (arg.startsWith("--host=")) {
      config.host = arg.slice("--host=".length);
    } else if (!arg.startsWith("-") && !config.workspacePath) {
      config.workspacePath = arg;
    }
  }

  if (!config.workspacePath) {
    throw new Error(
      "Missing desktop workspace. Use `yarn start:desktop -- --workspace /path/to/folder`.",
    );
  }
  if (!Number.isFinite(config.port) || config.port < 0) {
    throw new Error(`Invalid desktop port: ${config.port}`);
  }

  return {
    ...config,
    workspacePath: path.resolve(config.workspacePath),
    appBuildPath: path.resolve(config.appBuildPath),
  };
}
