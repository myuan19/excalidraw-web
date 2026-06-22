import {
  isManualCheckpointSource,
  resolveCheckpointPolicy,
  type CheckpointPolicy,
} from "./checkpointPolicy";
import { getClientTabId } from "./clientRequestContext";
import { createLogger } from "../lib/logger";

import type { PutFileResult } from "./ServerSync";
import type { SaveToServerSource } from "../hooks/types";

const log = createLogger({ module: "checkpointSave" });

function hash8(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 8) : null;
}

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
  version?: number | null;
  updatedAt?: string | null;
  fileThumbnail?: string | null;
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

  log.info("evaluate", {
    clientTabId: getClientTabId(),
    fileId8: input.fileId.slice(0, 8),
    source: input.source,
    contentHash8: hash8(input.contentHash),
    baselineHash8: hash8(input.baselineHash),
    unchanged,
    forceThumbnail: !!input.forceThumbnail,
    forcePut: !!input.forcePut,
    checkpointPolicy: checkpointPolicy.mode,
    shouldCheckUnchangedLatest,
  });

  if (
    unchanged &&
    checkpointPolicy.mode === "none" &&
    !shouldCheckUnchangedLatest
  ) {
    log.info("skip put", {
      clientTabId: getClientTabId(),
      fileId8: input.fileId.slice(0, 8),
      source: input.source,
      reason: "unchanged-no-checkpoint",
    });
    return {
      saved: false,
      checkpointCreated: false,
      contentSha256: input.baselineHash,
    };
  }

  if (unchanged && !shouldCheckUnchangedLatest) {
    log.info("skip put", {
      clientTabId: getClientTabId(),
      fileId8: input.fileId.slice(0, 8),
      source: input.source,
      reason: "unchanged",
      checkpointPolicy: checkpointPolicy.mode,
    });
    return {
      saved: false,
      checkpointCreated: false,
      contentSha256: input.baselineHash,
    };
  }

  const fileThumbnail = await deps.resolveFileThumbnailForPut();
  log.info("put start", {
    clientTabId: getClientTabId(),
    fileId8: input.fileId.slice(0, 8),
    source: input.source,
    hasThumbnail: typeof fileThumbnail === "string" && fileThumbnail.length > 0,
    clearThumbnail: fileThumbnail === null,
    checkpointPolicy: checkpointPolicy.mode,
  });
  const result = await deps.putDocument({
    thumbnail: fileThumbnail,
    checkpointPolicy,
  });

  log.info("put done", {
    clientTabId: getClientTabId(),
    fileId8: input.fileId.slice(0, 8),
    source: input.source,
    skipped: !!result?.skipped,
    checkpointCreated: !!result?.checkpoint?.created,
    contentSha8: hash8(result?.content_sha256),
    version: result?.version ?? null,
  });

  return {
    saved: true,
    skipped: !!result?.skipped,
    checkpointCreated: !!result?.checkpoint?.created,
    contentSha256: result?.content_sha256 ?? null,
    version: result?.version ?? null,
    updatedAt: result?.updated_at ?? null,
    fileThumbnail:
      typeof fileThumbnail === "string" && fileThumbnail.length > 0
        ? fileThumbnail
        : null,
  };
}
