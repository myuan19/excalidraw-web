export function isPublicEmbedStaticAssetPath(pathname) {
  return /^\/(?:assets|fonts)\//.test(pathname);
}

export function isTokenProtectedEmbedPath(pathname) {
  if (isPublicEmbedStaticAssetPath(pathname)) {
    return false;
  }
  return true;
}
