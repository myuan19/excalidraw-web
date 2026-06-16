import { ServerSync, type CheckpointStatus } from "./ServerSync";

export type CheckpointCoverage = {
  isAlreadyArchived: boolean;
  currentContentSha256: string | null;
  matchingArchive: CheckpointStatus["matchingArchive"];
};

export async function fetchCheckpointCoverage(
  fileId: string,
): Promise<CheckpointCoverage> {
  const status = await ServerSync.getCheckpointStatus(fileId);
  return {
    isAlreadyArchived: status.hasCurrentCheckpoint,
    currentContentSha256: status.currentContentSha256,
    matchingArchive: status.matchingArchive ?? null,
  };
}

export function needsRestoreBackupOffer(
  coverage: Pick<CheckpointCoverage, "isAlreadyArchived">,
): boolean {
  return !coverage.isAlreadyArchived;
}
