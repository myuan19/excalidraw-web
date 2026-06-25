import fs from "node:fs";

export function resolveDesktopDataDir() {
  const dataDir = process.env.EXCALIDRAW_DATA_DIR;
  if (!dataDir) {
    throw new Error("EXCALIDRAW_DATA_DIR is not set");
  }
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function resolveDesktopDataFile(name) {
  return `${resolveDesktopDataDir()}/${name}`;
}
