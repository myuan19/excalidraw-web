import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServerSyncError } from "../data/ServerSync";

import { promptServerUpdateConfirm } from "./editorLeaveConfirm";
import { resolveEditorSaveConflict } from "./editorSaveConflict";

vi.mock("./editorLeaveConfirm", () => ({
  promptServerUpdateConfirm: vi.fn(),
}));

const promptServerUpdateConfirmMock = vi.mocked(promptServerUpdateConfirm);

function versionConflict(version = 7): ServerSyncError {
  return new ServerSyncError(
    "version conflict",
    409,
    "/files/file-1",
    JSON.stringify({ error: "version_conflict", version }),
  );
}

describe("resolveEditorSaveConflict", () => {
  beforeEach(() => {
    promptServerUpdateConfirmMock.mockReset();
  });

  it("loads the remote version when the user chooses server data", async () => {
    promptServerUpdateConfirmMock.mockResolvedValue("load-remote");
    const loadRemote = vi.fn(async () => undefined);
    const forceOverwrite = vi.fn(async () => true);

    const result = await resolveEditorSaveConflict(versionConflict(9), {
      documentName: "Sketch",
      loadRemote,
      forceOverwrite,
    });

    expect(promptServerUpdateConfirmMock).toHaveBeenCalledWith({
      documentName: "Sketch",
      serverVersion: 9,
      mode: "save-conflict",
    });
    expect(loadRemote).toHaveBeenCalledTimes(1);
    expect(forceOverwrite).not.toHaveBeenCalled();
    expect(result).toEqual({
      handled: true,
      action: "load-remote",
      saved: true,
    });
  });

  it("force overwrites through the provided save callback", async () => {
    promptServerUpdateConfirmMock.mockResolvedValue("keep-local");
    const loadRemote = vi.fn(async () => undefined);
    const forceOverwrite = vi.fn(async () => true);

    const result = await resolveEditorSaveConflict(versionConflict(), {
      loadRemote,
      forceOverwrite,
    });

    expect(loadRemote).not.toHaveBeenCalled();
    expect(forceOverwrite).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      handled: true,
      action: "force-overwrite",
      saved: true,
    });
  });

  it("ignores non-conflict errors", async () => {
    const result = await resolveEditorSaveConflict(new Error("network"), {
      loadRemote: vi.fn(),
      forceOverwrite: vi.fn(),
    });

    expect(promptServerUpdateConfirmMock).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: false });
  });
});
