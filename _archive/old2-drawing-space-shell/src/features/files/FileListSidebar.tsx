import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderTree } from "@/features/files/FolderTree";
import { computeFileListSidebarMinWidth } from "@/features/files/computeFileListSidebarMinWidth";
import { useFileStore } from "@/stores/fileStore";
import { cn } from "@/lib/utils";

const WIDTH_STORAGE_KEY = "drawing-space-filelist-sidebar-width";
const DEFAULT_WIDTH = 192;
const MAX_WIDTH_VW = 0.35;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export function FileListSidebar() {
  const folders = useFileStore((s) => s.folders);
  const files = useFileStore((s) => s.files);
  const [width, setWidth] = useState(readStoredWidth);
  const [resizing, setResizing] = useState(false);
  const minWidth = useMemo(
    () => computeFileListSidebarMinWidth(folders, files),
    [folders, files],
  );
  const maxWidth = useMemo(
    () => Math.max(minWidth + 40, Math.floor(window.innerWidth * MAX_WIDTH_VW)),
    [minWidth],
  );

  const resizeRef = useRef({
    startX: 0,
    startWidth: width,
    minWidth,
    maxWidth,
  });

  useEffect(() => {
    resizeRef.current.minWidth = minWidth;
    resizeRef.current.maxWidth = maxWidth;
    setWidth((current) => Math.min(maxWidth, Math.max(minWidth, current)));
  }, [minWidth, maxWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    } catch {
      // best-effort
    }
  }, [width]);

  const onResizeMove = useCallback((event: MouseEvent) => {
    const delta = event.clientX - resizeRef.current.startX;
    const next = Math.min(
      resizeRef.current.maxWidth,
      Math.max(resizeRef.current.minWidth, resizeRef.current.startWidth + delta),
    );
    setWidth(next);
  }, []);

  const onResizeEnd = useCallback(() => {
    setResizing(false);
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }, [onResizeMove]);

  function startResize(event: React.MouseEvent) {
    event.preventDefault();
    resizeRef.current = {
      startX: event.clientX,
      startWidth: width,
      minWidth,
      maxWidth,
    };
    setResizing(true);
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }

  return (
    <aside
      className={cn(
        "filelist-sidebar hidden shrink-0 border-r border-border md:flex",
        resizing && "filelist-sidebar--resizing",
      )}
      style={{ width, minWidth, maxWidth }}
    >
      <div className="filelist-sidebar-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto">
        <FolderTree />
      </div>
      <button
        type="button"
        aria-label="调整侧栏宽度"
        className="filelist-sidebar-resizer"
        onMouseDown={startResize}
      />
    </aside>
  );
}
