import { uploadArchiveThumbnail } from "./thumbnailService";

import type { ArchiveEntry, PutFileResult } from "./ServerSync";

type CheckpointLike = ArchiveEntry | NonNullable<PutFileResult["checkpoint"]>;

/** @deprecated Use uploadArchiveThumbnail from thumbnailService. */
export async function persistArchiveThumbnailIfAvailable(
  fileId: string,
  checkpoint: CheckpointLike | null | undefined,
  thumbnail: string | null | undefined,
): Promise<void> {
  if (!checkpoint?.id) {
    return;
  }
  await uploadArchiveThumbnail(fileId, checkpoint.id, thumbnail);
}
