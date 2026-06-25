import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { parseDesktopArgs } from "./config.mjs";

const ORIGINAL_WORKSPACE_ENV = process.env.EDITORHUB_DESKTOP_WORKSPACE;

describe("parseDesktopArgs", () => {
  afterEach(() => {
    if (ORIGINAL_WORKSPACE_ENV === undefined) {
      delete process.env.EDITORHUB_DESKTOP_WORKSPACE;
    } else {
      process.env.EDITORHUB_DESKTOP_WORKSPACE = ORIGINAL_WORKSPACE_ENV;
    }
  });

  it("uses the persisted/default workspace and ignores legacy workspace inputs", () => {
    process.env.EDITORHUB_DESKTOP_WORKSPACE = "C:/ignored-env-workspace";
    const configuredWorkspace = "C:/EditorHub/PersistedWorkspace";

    const config = parseDesktopArgs(
      [
        "--workspace",
        "C:/ignored-cli-workspace",
        "--workspace=C:/ignored-equals-workspace",
        "C:/ignored-positional-workspace",
      ],
      {
        projectRoot: "C:/EditorHub",
        workspacePath: configuredWorkspace,
      },
    );

    expect(config.workspacePath).toBe(path.resolve(configuredWorkspace));
  });
});
