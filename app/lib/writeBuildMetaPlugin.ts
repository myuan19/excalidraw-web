import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

function resolveGitSha(): string {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VITE_APP_GIT_SHA ||
    "";
  if (fromEnv.trim()) {
    return fromEnv.trim();
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "dev";
  }
}

/** Emits `build/build-meta.json` next to the SPA bundle for deploy freshness checks. */
export function writeBuildMetaPlugin(outDir: string): Plugin {
  return {
    name: "write-build-meta",
    closeBundle() {
      const meta = {
        gitSha: resolveGitSha(),
        buildTime: new Date().toISOString(),
      };
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        path.join(outDir, "build-meta.json"),
        `${JSON.stringify(meta, null, 2)}\n`,
        "utf-8",
      );
    },
  };
}
