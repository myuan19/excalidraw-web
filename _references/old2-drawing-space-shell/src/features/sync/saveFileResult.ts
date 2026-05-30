export type SaveFileResult = {
  ok?: boolean;
  skipped?: boolean;
  updated_at?: string;
  content_sha256?: string | null;
};

export function applySaveFileResult(
  result: SaveFileResult,
  fallback: { updated_at: string; content_sha256: string | null },
): { updated_at: string; content_sha256: string | null; skipped: boolean } {
  return {
    updated_at: result.updated_at ?? fallback.updated_at,
    content_sha256: result.content_sha256 ?? fallback.content_sha256,
    skipped: !!result.skipped,
  };
}
