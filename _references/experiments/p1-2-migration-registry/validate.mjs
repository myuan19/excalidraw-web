import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CURRENT_VERSION = 3;

const migrations = {
  1(data) {
    return {
      ...data,
      root: {
        data: data.root?.data ?? { text: "Untitled" },
        children: data.root?.children ?? [],
      },
    };
  },
  2(data) {
    return {
      layout: data.layout ?? "mindMap",
      root: data.root,
      theme: data.theme ?? { template: "default", config: {} },
      view: data.view ?? { scale: 1, x: 0, y: 0 },
    };
  },
};

function migrate(data, fromVersion) {
  let version = fromVersion;
  let next = data;
  while (version < CURRENT_VERSION) {
    const migration = migrations[version];
    if (!migration) {
      throw new Error(`missing migration for version ${version}`);
    }
    next = migration(next);
    version += 1;
  }
  return { data: next, version };
}

const oldData = {
  root: {
    data: { text: "Root" },
    children: [],
  },
};

const migrated = migrate(oldData, 1);

let missingMigrationError = null;
try {
  migrate(oldData, 0);
} catch (error) {
  missingMigrationError = error.message;
}

const checks = {
  migratedToCurrentVersion: migrated.version === CURRENT_VERSION,
  layoutFilled: migrated.data.layout === "mindMap",
  themeFilled: migrated.data.theme?.template === "default",
  viewFilled: migrated.data.view?.scale === 1,
  missingMigrationFailsClearly:
    missingMigrationError === "missing migration for version 0",
};

const result = {
  id: "P1-2",
  title: "最小迁移 registry",
  conclusion: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  checks,
  migrated,
  recommendation:
    "Keep container migrations and format migrations separate; missing migration should fail before mutating persisted data.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
