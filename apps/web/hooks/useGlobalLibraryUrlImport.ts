import { useEffect } from "react";

import { startGlobalLibraryUrlImportListener } from "../data/libraryUrlImport";

/** Mount once at app root to handle `#addLibrary=` deep links in the background. */
export function useGlobalLibraryUrlImport(): void {
  useEffect(() => startGlobalLibraryUrlImportListener(), []);
}
