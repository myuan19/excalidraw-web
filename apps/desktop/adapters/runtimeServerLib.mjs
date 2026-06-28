import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DESKTOP_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function getRuntimeRoot() {
  const envRoot = process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT?.trim();
  if (envRoot) {
    return envRoot;
  }
  return path.resolve(DESKTOP_PACKAGE_ROOT, "../..");
}

export function loadRuntimeServerModule(relativePath) {
  const normalized = relativePath.replace(/^\/+/, "");
  const modulePath = path.join(getRuntimeRoot(), "server", normalized);
  return import(pathToFileURL(modulePath).href);
}
