/** 服务端卡片缩略图 URL（缓存键仅 content_sha256；u 仅作服务端辅助）。 */
export function buildServerThumbnailRequestPath(
  fileId: string,
  file: {
    content_sha256?: string | null;
    updated_at?: string | null;
  },
): string {
  const base = `/api/files/${fileId}/thumbnail`;
  if (!file.content_sha256) {
    return base;
  }
  const params = new URLSearchParams();
  params.set("h", file.content_sha256);
  if (file.updated_at) {
    params.set("u", file.updated_at);
  }
  return `${base}?${params.toString()}`;
}

export function serverThumbnailCacheKey(
  contentSha: string | null | undefined,
): string | null {
  return contentSha ?? null;
}
