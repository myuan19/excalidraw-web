import {
  isManualCheckpointSource,
  resolveCheckpointPolicy,
  type CheckpointPolicy,
} from "./checkpointPolicy";
import { uploadArchiveThumbnail } from "./thumbnailService";

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
  resolveArchiveThumbnailSvg: () => Promise<string | null>;
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
  updatedAt?: string | null;
};

export async function executeCheckpointSave(
  input: CheckpointSaveInput,
  deps: CheckpointSaveDeps,
): Promise<CheckpointSaveOutcome> {
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
    return {
      saved: false,
      checkpointCreated: false,
      contentSha256: input.baselineHash,
    };
  }

  if (unchanged && !shouldCheckUnchangedLatest) {
    return {
      saved: false,
      checkpointCreated: false,
      contentSha256: input.baselineHash,
    };
  }

  const fileThumbnail = await deps.resolveFileThumbnailForPut();
  const result = await deps.putDocument({
    thumbnail: fileThumbnail,
    checkpointPolicy,
  });
  const archiveThumbnail = await deps.resolveArchiveThumbnailSvg();
  if (result?.checkpoint?.id) {
    await uploadArchiveThumbnail(
      input.fileId,
      result.checkpoint.id,
      archiveThumbnail,
    );
  }

  return {
    saved: true,
    skipped: !!result?.skipped,
    checkpointCreated: !!result?.checkpoint?.created,
    contentSha256: result?.content_sha256 ?? null,
    updatedAt: result?.updated_at ?? null,
  };
}
