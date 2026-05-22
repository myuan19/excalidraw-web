import { useMemo } from "react";
import { useFileStore } from "@/stores/fileStore";
import type { ServerFolder } from "@/types/file";

export function PathBar() {
  const folders = useFileStore((s) => s.folders);
  const currentFolderId = useFileStore((s) => s.currentFolderId);
  const setCurrentFolder = useFileStore((s) => s.setCurrentFolder);

  const breadcrumb = useMemo(() => {
    if (!currentFolderId) return [];
    const path: ServerFolder[] = [];
    let id: string | null = currentFolderId;
    while (id) {
      const folder = folders.find((f) => f.id === id);
      if (!folder) break;
      path.unshift(folder);
      id = folder.parent_id;
    }
    return path;
  }, [folders, currentFolderId]);

  return (
    <nav className="flex min-w-0 items-center gap-xs overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setCurrentFolder(null)}
        className="shrink-0 text-muted transition-colors hover:text-foreground"
      >
        全部文件
      </button>

      {breadcrumb.map((folder) => (
        <span key={folder.id} className="flex min-w-0 shrink items-center gap-xs">
          <span className="icon-[mdi--chevron-right] shrink-0 text-xs text-muted" />
          <button
            type="button"
            onClick={() => setCurrentFolder(folder.id)}
            className="path-bar-crumb truncate text-muted transition-colors hover:text-foreground last:font-medium last:text-foreground"
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
