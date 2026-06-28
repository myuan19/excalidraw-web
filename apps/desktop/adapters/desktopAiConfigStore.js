import fs from "node:fs";

import { loadRuntimeServerModule } from "./runtimeServerLib.mjs";
import { resolveDesktopDataFile } from "./desktopDataDir.js";

let settingsConfigModulePromise;

function loadSettingsConfigModule() {
  settingsConfigModulePromise ??= loadRuntimeServerModule("lib/aiSettingsConfig.js");
  return settingsConfigModulePromise;
}

export async function ensureDesktopAiSettingsConfig() {
  await loadSettingsConfigModule();
}

function configPath() {
  return resolveDesktopDataFile("ai-settings.json");
}

export async function readDesktopAiConfig() {
  const { emptyConfig, normalizeConfig } = await loadSettingsConfigModule();
  try {
    const filePath = configPath();
    if (!fs.existsSync(filePath)) {
      return emptyConfig();
    }
    return normalizeConfig(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    const { emptyConfig } = await loadSettingsConfigModule();
    return emptyConfig();
  }
}

export async function writeDesktopAiConfig(config) {
  const { normalizeConfig } = await loadSettingsConfigModule();
  fs.writeFileSync(
    configPath(),
    `${JSON.stringify(normalizeConfig(config), null, 2)}\n`,
    "utf8",
  );
}
