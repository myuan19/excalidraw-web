import fs from "node:fs";

import {
  emptyConfig,
  normalizeConfig,
} from "../../../server/lib/aiSettingsConfig.js";

import { resolveDesktopDataFile } from "./desktopDataDir.js";

function configPath() {
  return resolveDesktopDataFile("ai-settings.json");
}

export function readDesktopAiConfig() {
  try {
    const path = configPath();
    if (!fs.existsSync(path)) {
      return emptyConfig();
    }
    return normalizeConfig(JSON.parse(fs.readFileSync(path, "utf8")));
  } catch {
    return emptyConfig();
  }
}

export function writeDesktopAiConfig(config) {
  fs.writeFileSync(
    configPath(),
    `${JSON.stringify(normalizeConfig(config), null, 2)}\n`,
    "utf8",
  );
}
