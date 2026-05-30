import { useState } from "react";
import { useFileStore } from "@/stores/fileStore";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ServerFile } from "@/types/file";

interface MoveFileDialogProps {
  open: boolean;
  onClose(): void;
  file: ServerFile | null;
  onMove(folderId: string | null): void;
}

export function MoveFileDialog({
  open,
  onClose,
  file,
  onMove,
}: MoveFileDialogProps) {
  const folders = useFileStore((s) => s.folders);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleMove() {
    onMove(selectedId);
    onClose();
  }

  function renderTree(parentId: string | null, depth: number) {
    const children = folders
      .filter((f) => f.parent_id === parentId)
      .sort((a, b) => a.sort_index - b.sort_index);

    return children.map((folder) => {
      const isCurrent = file?.folder_id === folder.id;
      const isSelected = selectedId === folder.id;

      return (
        <div key={folder.id}>
          <button
            type="button"
            disabled={isCurrent}
            onClick={() => setSelectedId(folder.id)}
            className={cn(
              "move-dialog-tree-row flex w-full items-center gap-sm rounded-md py-sm text-sm transition-colors",
              isSelected
                ? "bg-accent-soft text-accent font-medium"
                : "text-foreground hover:bg-surface-muted",
              isCurrent && "cursor-not-allowed opacity-40",
            )}
            // react-stack-ignore-next-line: dynamic folder tree depth via CSS variable
            style={{ "--tree-depth": depth } as React.CSSProperties}
          >
            <span className="icon-[mdi--folder-outline] move-dialog-icon shrink-0" />
            <span className="truncate">{folder.name}</span>
            {isCurrent && (
              <span className="move-dialog-current ml-auto shrink-0 text-muted">
                当前位置
              </span>
            )}
          </button>
          {renderTree(folder.id, depth + 1)}
        </div>
      );
    });
  }

  const isRootCurrent = file?.folder_id === null;

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>移动文件</DialogTitle>
        <DialogDescription>
          选择"{file?.name}"的目标文件夹
        </DialogDescription>
      </DialogHeader>

      <div className="move-dialog-list max-h-64 min-h-48 overflow-y-auto p-sm">
        <button
          type="button"
          disabled={isRootCurrent}
          onClick={() => setSelectedId(null)}
          className={cn(
            "flex w-full items-center gap-sm rounded-md px-md py-sm text-sm transition-colors",
            selectedId === null
              ? "bg-accent-soft text-accent font-medium"
              : "text-foreground hover:bg-surface-muted",
            isRootCurrent && "cursor-not-allowed opacity-40",
          )}
        >
          <span className="icon-[mdi--folder-multiple-outline] move-dialog-icon shrink-0" />
          <span className="truncate">全部文件 (根目录)</span>
          {isRootCurrent && (
            <span className="move-dialog-current ml-auto shrink-0 text-muted">
              当前位置
            </span>
          )}
        </button>
        {renderTree(null, 1)}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button onClick={handleMove}>移动</Button>
      </DialogFooter>
    </Dialog>
  );
}
