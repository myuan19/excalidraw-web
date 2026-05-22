import { useEffect, useMemo, useState } from "react";
import { HomeOverviewSection } from "@/features/home/HomeOverviewSection";
import { HomeRecentSection } from "@/features/home/HomeRecentSection";
import { resolveHomeTempFiles } from "@/features/home/resolveHomeTempFiles";
import { resolveRecentFiles } from "@/features/home/resolveRecentFiles";
import { requestNewTempFile } from "@/features/files/startNewTempFile";
import { useThumbnailPipeline } from "@/features/thumbnail";
import { navigateAppView } from "@/features/navigation";
import { useFileStore } from "@/stores/fileStore";

export function HomePage() {
  const files = useFileStore((state) => state.files);
  const loading = useFileStore((state) => state.loading);
  const loadFileTree = useFileStore((state) => state.loadFileTree);

  useEffect(() => {
    void loadFileTree();
  }, [loadFileTree]);

  const [tempVersion, setTempVersion] = useState(0);

  useEffect(() => {
    const onTempChange = () => setTempVersion((v) => v + 1);
    window.addEventListener("temp-files-change", onTempChange);
    return () => window.removeEventListener("temp-files-change", onTempChange);
  }, []);

  const recentFiles = useMemo(
    () => resolveRecentFiles(files),
    [files, tempVersion],
  );
  const tempFiles = useMemo(
    () => resolveHomeTempFiles(),
    [tempVersion],
  );

  useThumbnailPipeline([...recentFiles, ...tempFiles]);

  function handleQuickCreate(kind: string) {
    requestNewTempFile(kind);
  }

  return (
    <div className="home-scroll-page">
      <div className="home-scroll-inner">
        <HomeOverviewSection
          files={files}
          recentCount={recentFiles.length}
          loading={loading}
          onOpenFiles={() => navigateAppView("files")}
          onQuickCreate={handleQuickCreate}
        />
        <div className="home-section-divider" role="separator" />
        <HomeRecentSection
          files={recentFiles}
          tempFiles={tempFiles}
          loading={loading}
        />
      </div>
    </div>
  );
}
