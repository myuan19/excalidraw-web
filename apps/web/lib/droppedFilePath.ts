/** Electron 42+ 拖放 File 不再暴露 `.path`，需经 preload 的 webUtils.getPathForFile。 */
export function getDroppedFileAbsPath(file: File): string | undefined {
  const fromDesktop = window.editorHubDesktop?.getPathForFile?.(file)?.trim();
  if (fromDesktop) {
    return fromDesktop;
  }
  const legacyPath = (file as File & { path?: string }).path?.trim();
  return legacyPath || undefined;
}

export function readDroppedFileAbsPaths(fileList: FileList | File[]): string[] {
  return Array.from(fileList)
    .map((file) => getDroppedFileAbsPath(file))
    .filter((value): value is string => !!value);
}
