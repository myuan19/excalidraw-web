import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FLAGS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "desktopBuildFlags.json",
);

export function readDesktopBuildFlags() {
  if (!existsSync(FLAGS_PATH)) {
    return { debugPack: false };
  }
  try {
    const parsed = JSON.parse(readFileSync(FLAGS_PATH, "utf8"));
    return {
      debugPack: parsed?.debugPack === true,
      builtAt: typeof parsed?.builtAt === "string" ? parsed.builtAt : null,
    };
  } catch {
    return { debugPack: false };
  }
}

/** Apply flags baked in at pack time (before server env / window load). */
export function applyDesktopBuildFlags() {
  const flags = readDesktopBuildFlags();
  if (!flags.debugPack) {
    return flags;
  }
  process.env.EDITORHUB_DESKTOP_DEBUG ||= "1";
  process.env.DEPLOY_DEBUG ||= "1";
  return flags;
}
