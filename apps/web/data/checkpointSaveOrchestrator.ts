import {
  isManualCheckpointSource,
  resolveCheckpointPolicy,
  type CheckpointPolicy,
} from "./checkpointPolicy";
import { traceMindMapOperation } from "./mindMapOperationTrace";
import { traceUserAction } from "../lib/userTrace";

import type { PutFileResult } from "./ServerSync";
import type { SaveToServerSource } from "../hooks/types";

export type CheckpointSaveInput = {
  fileId: string;
  source: SaveToServerSource;
  contentHash: string;
  baselineHash: string | null;
  forceThumbnail?: boolean;
  /** Always PUT latest (e.g. restore-backup checkpoint) even when unchanged. */
  forcePut?: boolean;
  document: unknown;
  displayName?: string;
  checkpointPolicyOverride?: CheckpointPolicy;
};

export type CheckpointSaveDeps = {
  resolveFileThumbnailForPut: () => Promise<string | null | undefined>;
  putDocument: (args: {
    thumbnail: string | null | undefined;
    checkpointPolicy: CheckpointPolicy;
  }) => Promise<PutFileResult>;
};

export type CheckpointSaveOutcome = {
  saved: boolean;
  skipped?: boolean;
  checkpointCreated: boolean;
  contentSha256?: string | null;
  fileThumbnail?: string | null;
  version?: number | null;
  updatedAt?: string | null;
};

export async function executeCheckpointSave(
  input: CheckpointSaveInput,
  deps: CheckpointSaveDeps,
): Promise<CheckpointSaveOutcome> {
  traceUserAction("checkpoint", "executeCheckpointSave", {
    fileId8: input.fileId.slice(0, 8),
    source: input.source,
    forcePut: !!input.forcePut,
    forceThumbnail: !!input.forceThumbnail,
  }, "start");

  const unchanged =
    !!input.baselineHash &&
    input.contentHash === input.baselineHash &&
    !input.forceThumbnail &&
    !input.forcePut;

  const checkpointPolicy =
    input.checkpointPolicyOverride ?? resolveCheckpointPolicy(input.source);
  const shouldCheckUnchangedLatest =
    isManualCheckpointSource(input.source) || input.source === "home";

  if (
    unchanged &&
    checkpointPolicy.mode === "none" &&
    !shouldCheckUnchangedLatest
  ) {
    traceMindMapOperation("checkpoint.execute.skip", {
      fileId8: input.fileId.slice(0, 8),
      source: input.source,
      branch: "unchanged-no-checkpoint",
      contentHash8: input.contentHash.slice(0, 8),
      baselineHash8: input.baselineHash?.slice(0, 8) ?? null,
    });
    traceUserAction("checkpoint", "executeCheckpointSave", {
      fileId8: input.fileId.slice(0, 8),
      branch: "unchanged-no-checkpoint",
    }, "skip");
    return {
      saved: false,
      checkpointCreated: false,
      contentSha256: input.baselineHash,
    };
  }

  if (unchanged && !shouldCheckUnchangedLatest) {
    traceMindMapOperation("checkpoint.execute.skip", {
      fileId8: input.fileId.slice(0, 8),
      source: input.source,
      branch: "unchanged-skip-put",
      contentHash8: input.contentHash.slice(0, 8),
      baselineHash8: input.baselineHash?.slice(0, 8) ?? null,
    });
    traceUserAction("checkpoint", "executeCheckpointSave", {
      fileId8: input.fileId.slice(0, 8),
      branch: "unchanged-skip-put",
    }, "skip");
    return {
      saved: false,
      checkpointCreated: false,
      contentSha256: input.baselineHash,
    };
  }

  const fileThumbnail = await deps.resolveFileThumbnailForPut();
  traceMindMapOperation("checkpoint.execute.putDocument", {
    fileId8: input.fileId.slice(0, 8),
    source: input.source,
    checkpointPolicy,
    contentHash8: input.contentHash.slice(0, 8),
    baselineHash8: input.baselineHash?.slice(0, 8) ?? null,
    hasThumbnail: fileThumbnail != null && fileThumbnail.length > 0,
  });
  const result = await deps.putDocument({
    thumbnail: fileThumbnail,
    checkpointPolicy,
  });

  traceUserAction("checkpoint", "executeCheckpointSave", {
    fileId8: input.fileId.slice(0, 8),
    skipped: !!result?.skipped,
    checkpointCreated: !!result?.checkpoint?.created,
    sha8: result?.content_sha256?.slice(0, 8) ?? null,
  }, "ok");

  return {
    saved: true,
    skipped: !!result?.skipped,
    checkpointCreated: !!result?.checkpoint?.created,
    contentSha256: result?.content_sha256 ?? null,
    fileThumbnail,
    version: result?.version ?? null,
    updatedAt: result?.updated_at ?? null,
  };
}
