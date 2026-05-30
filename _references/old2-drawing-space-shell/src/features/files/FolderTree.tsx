import { useState, useCallback } from "react";
import { useFileStore, getDescendantFolderIds } from "@/stores/fileStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DropMode = "before" | "into" | "after";

interface DropTarget {
  folderId: string;
  mode: DropMode;
}

const DEFAULT_FOLDER_NAME = "新建文件夹";

function FolderNameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit(name: string): void;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Input
      autoFocus
      value={draft}
      className="h-7 min-w-0 flex-1 px-sm py-0 text-sm"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed) onCommit(trimmed);
        else onCancel();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          const trimmed = draft.trim();
          if (trimmed) onCommit(trimmed);
          else onCancel();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function TreeActionButton({
  title,
  icon,
  onClick,
  danger,
}: {
  title: string;
  icon: string;
  onClick(e: React.MouseEvent): void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface hover:text-foreground",
        danger && "hover:text-danger",
      )}
      onClick={onClick}
    >
      <span className={cn(icon, "text-sm")} />
    </button>
  );
}

export function FolderTree() {
  const folders = useFileStore((s) => s.folders);
  const currentFolderId = useFileStore((s) => s.currentFolderId);
  const expandedFolders = useFileStore((s) => s.expandedFolders);
  const setCurrentFolder = useFileStore((s) => s.setCurrentFolder);
  const toggleFolder = useFileStore((s) => s.toggleFolder);
  const setExpandedFolder = useFileStore((s) => s.setExpandedFolder);
  const createFolder = useFileStore((s) => s.createFolder);
  const renameFolder = useFileStore((s) => s.renameFolder);
  const removeFolder = useFileStore((s) => s.removeFolder);
  const moveFolderTo = useFileStore((s) => s.moveFolderTo);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingInitialName, setEditingInitialName] = useState("");

  const handleDragStart = useCallback(
    (e: React.DragEvent, folderId: string) => {
      e.dataTransfer.setData("text/plain", folderId);
      e.dataTransfer.effectAllowed = "move";
      setDraggedId(folderId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, folderId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const third = rect.height / 3;

      let mode: DropMode;
      if (y < third) mode = "before";
      else if (y > third * 2) mode = "after";
      else mode = "into";

      setDropTarget({ folderId, mode });
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetId) {
        setDraggedId(null);
        setDropTarget(null);
        return;
      }

      const descendants = getDescendantFolderIds(folders, sourceId);
      if (descendants.has(targetId)) {
        setDraggedId(null);
        setDropTarget(null);
        return;
      }

      const target = folders.find((f) => f.id === targetId);
      if (!target) return;

      const mode = dropTarget?.mode ?? "into";

      if (mode === "into") {
        const childrenCount = folders.filter(
          (f) => f.parent_id === targetId,
        ).length;
        moveFolderTo(sourceId, targetId, childrenCount);
      } else {
        const parentId = target.parent_id;
        const siblings = folders
          .filter((f) => f.parent_id === parentId && f.id !== sourceId)
          .sort((a, b) => a.sort_index - b.sort_index);

        const targetIdx = siblings.findIndex((f) => f.id === targetId);
        const insertIdx = mode === "before" ? targetIdx : targetIdx + 1;
        moveFolderTo(sourceId, parentId, insertIdx);
      }

      setDraggedId(null);
      setDropTarget(null);
    },
    [folders, dropTarget, moveFolderTo],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  const startEditingFolder = useCallback((folderId: string, name: string) => {
    setEditingFolderId(folderId);
    setEditingInitialName(name);
  }, []);

  const handleNewFolder = useCallback(async (parentId: string | null = currentFolderId) => {
    try {
      const folder = await createFolder(DEFAULT_FOLDER_NAME, parentId);
      if (parentId) setExpandedFolder(parentId, true);
      setCurrentFolder(folder.id);
      startEditingFolder(folder.id, folder.name);
    } catch {
      // createFolder surfaces errors via fileStore.
    }
  }, [createFolder, currentFolderId, setCurrentFolder, setExpandedFolder, startEditingFolder]);

  const commitFolderRename = useCallback(async (folderId: string, name: string) => {
    const folder = folders.find((item) => item.id === folderId);
    setEditingFolderId(null);
    if (!folder || name === folder.name) {
      if (folder && name !== folder.name && !name.trim()) {
        await removeFolder(folderId);
      }
      return;
    }
    await renameFolder(folderId, name);
  }, [folders, removeFolder, renameFolder]);

  const cancelFolderRename = useCallback(async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    setEditingFolderId(null);
    if (folder?.name === DEFAULT_FOLDER_NAME) {
      await removeFolder(folderId);
    }
  }, [folders, removeFolder]);

  const handleDeleteFolder = useCallback((folderId: string, folderName: string) => {
    if (!confirm(`删除文件夹「${folderName}」？子文件夹会一并删除，文件会移到根目录。`)) {
      return;
    }
    void removeFolder(folderId);
  }, [removeFolder]);

  function renderFolderTree(parentId: string | null, depth: number) {
    const children = folders
      .filter((f) => f.parent_id === parentId)
      .sort((a, b) => a.sort_index - b.sort_index);

    return children.map((folder) => {
      const isExpanded = expandedFolders[folder.id];
      const isSelected = currentFolderId === folder.id;
      const hasChildren = folders.some((f) => f.parent_id === folder.id);
      const isDragging = draggedId === folder.id;
      const isDropTarget = dropTarget?.folderId === folder.id;
      const isEditing = editingFolderId === folder.id;

      return (
        <div key={folder.id}>
          <div
            className={cn(
              "filelist-tree-row group relative flex items-center gap-xs rounded-md text-sm transition-colors",
              isSelected
                ? "bg-accent-soft text-accent font-medium"
                : "text-foreground hover:bg-surface-muted",
              isDragging && "opacity-40",
              isDropTarget &&
                dropTarget.mode === "into" &&
                "bg-accent-soft",
            )}
            // react-stack-ignore-next-line: dynamic folder tree depth via CSS variable
            style={{ "--tree-depth": depth } as React.CSSProperties}
            onClick={() => {
              if (!isEditing) setCurrentFolder(folder.id);
            }}
            onDragOver={(e) => handleDragOver(e, folder.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder.id)}
          >
            {isDropTarget && dropTarget.mode === "before" && (
              <div className="absolute inset-x-1 top-0 h-0.5 rounded-full bg-accent" />
            )}
            {isDropTarget && dropTarget.mode === "after" && (
              <div className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />
            )}

            <span
              className="filelist-tree-drag flex cursor-grab items-center justify-center"
              draggable
              onDragStart={(e) => handleDragStart(e, folder.id)}
              onDragEnd={handleDragEnd}
            >
              <span className="icon-[mdi--drag-vertical] text-sm" />
            </span>

            <button
              type="button"
              className="flex h-7 w-5 shrink-0 items-center justify-center p-0"
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleFolder(folder.id);
              }}
            >
              <span
                className={cn(
                  "text-xs transition-transform",
                  hasChildren
                    ? "icon-[mdi--chevron-right]"
                    : "icon-[mdi--chevron-right] invisible",
                  isExpanded && "rotate-90",
                )}
              />
            </button>

            <span className="icon-[mdi--folder-outline] shrink-0 text-base" />
            {isEditing ? (
              <FolderNameInput
                value={editingInitialName}
                onCommit={(name) => void commitFolderRename(folder.id, name)}
                onCancel={() => void cancelFolderRename(folder.id)}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            )}
            {!isEditing && (
              <div className="filelist-tree-actions">
                <TreeActionButton
                  title="新建子文件夹"
                  icon="icon-[mdi--folder-plus-outline]"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleNewFolder(folder.id);
                  }}
                />
                <TreeActionButton
                  title="重命名"
                  icon="icon-[mdi--pencil-outline]"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditingFolder(folder.id, folder.name);
                  }}
                />
                <TreeActionButton
                  title="删除"
                  icon="icon-[mdi--delete-outline]"
                  danger
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id, folder.name);
                  }}
                />
              </div>
            )}
          </div>

          {isExpanded && hasChildren && renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <nav className="flex h-full w-full flex-col p-sm">
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        <button
          type="button"
          onClick={() => setCurrentFolder(null)}
          className={cn(
            "filelist-tree-row group flex w-full items-center gap-sm rounded-md px-md text-sm transition-colors",
            currentFolderId === null
              ? "bg-accent-soft text-accent font-medium"
              : "text-foreground hover:bg-surface-muted",
          )}
        >
          <span className="w-4 shrink-0" aria-hidden />
          <span className="w-5 shrink-0" aria-hidden />
          <span className="icon-[mdi--folder-multiple-outline] shrink-0 text-base" />
          <span className="whitespace-nowrap">全部文件</span>
        </button>

        <div className="mt-xs">{renderFolderTree(null, 0)}</div>
      </div>

      <div className="mt-sm border-t border-border pt-sm">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-sm text-muted"
          onClick={() => void handleNewFolder()}
        >
          <span className="icon-[mdi--folder-plus-outline] text-base" />
          新建文件夹
        </Button>
      </div>
    </nav>
  );
}
