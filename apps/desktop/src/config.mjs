import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_DEV_WORKSPACE = path.join(
  PROJECT_ROOT,
  "_dev_data",
  "desktop-workspace",
);

function assertValidWorkspacePath(workspacePath) {
  if (/[\u0000-\u001f;]/.test(workspacePath)) {
    throw new Error(
      `Invalid desktop workspace path: ${JSON.stringify(
        workspacePath,
      )}. Start from PowerShell/CMD or set MSYS2_ARG_CONV_EXCL='*' in Git Bash.`,
    );
  }
}

export function parseDesktopArgs(argv = process.argv.slice(2), defaults = {}) {
  const projectRoot = defaults.projectRoot || PROJECT_ROOT;
  const config = {
    host: process.env.DESKTOP_HOST || defaults.host || "127.0.0.1",
    port: Number(
      process.env.DESKTOP_PORT || process.env.PORT || defaults.port || 3033,
    ),
    workspacePath: defaults.workspacePath || DEFAULT_DEV_WORKSPACE,
    appBuildPath:
      process.env.EDITORHUB_DESKTOP_APP_BUILD ||
      defaults.appBuildPath ||
      path.join(projectRoot, "apps/web/build"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace") {
      // Legacy compatibility: workspace is now controlled by persisted desktop
      // settings, so command-line workspace inputs are intentionally ignored.
      index += 1;
    } else if (arg.startsWith("--workspace=")) {
      // Ignore legacy workspace argument.
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
    }
  }

  assertValidWorkspacePath(config.workspacePath);
  if (!Number.isFinite(config.port) || config.port < 0) {
    throw new Error(`Invalid desktop port: ${config.port}`);
  }

  return {
    ...config,
    workspacePath: path.resolve(config.workspacePath),
    appBuildPath: path.resolve(config.appBuildPath),
  };
}
