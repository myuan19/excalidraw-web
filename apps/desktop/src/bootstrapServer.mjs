import { assembleDesktopExpressApp } from "./bootstrapBackend.mjs";
import { writeDesktopLog } from "./desktopLogger.mjs";

export async function createDesktopServer(config) {
  writeDesktopLog("server", "create-begin", {
    workspacePath: config.workspacePath,
    appBuildPath: config.appBuildPath,
    host: config.host,
    port: config.port,
    runtimeRoot:
      config.runtimeRoot ?? process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT ?? "",
  });
  const { app } = await assembleDesktopExpressApp(config);
  return app;
}

export async function listenDesktopServer(config) {
  const app = await createDesktopServer(config);
  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : config.port;
      server.off("error", reject);
      const url = `http://${config.host}:${port}`;
      writeDesktopLog("server", "listen-ready", { url, host: config.host, port });
      resolve({
        app,
        server,
        url,
      });
    });
    server.once("error", (error) => {
      writeDesktopLog("server", "listen-error", { message: error.message });
      reject(error);
    });
  });
}
