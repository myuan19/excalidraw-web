import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ServerSync,
  type FileTreeResponse,
  type ServerFolder,
} from "../data/ServerSync";

import "./fileListDialogHost.scss";

function SvgIcon({
  d,
  size = 16,
}: {
  d: string;
  size?: number;
}) {
  return (
    <svg
      className="filelist__tree-row-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
    >
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const ICON = {
  folder:
    "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  chevron: "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
} as const;

/** Mapping roots always render as top-level siblings, same as the sidebar tree. */
function folderTreeParentId(folder: ServerFolder): string | null {
  if (folder.is_mapping_root) {
    return null;
  }
  return folder.parent_id ?? null;
}

function compareManual(
  a: { sort_index?: number; name: string },
  b: { sort_index?: number; name: string },
) {
  const ai = a.sort_index ?? 0;
  const bi = b.sort_index ?? 0;
  if (ai !== bi) {
    return ai - bi;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function buildFoldersByParent(folders: ServerFolder[]) {
  const byParent = new Map<string | null, ServerFolder[]>();
  for (const folder of folders) {
    const parent = folderTreeParentId(folder);
    const list = byParent.get(parent) ?? [];
    list.push(folder);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) {
    list.sort(compareManual);
  }
  return byParent;
}

type FolderPathPickerProps = {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  /** 为 true 时不展示树（目标文件夹已确定）。 */
  hidePicker?: boolean;
  /** save：保存到磁盘目录 + 目标文件夹；import：导入到目录 */
  variant?: "save" | "import";
  /** 外层已有区块标题时隐藏树上方重复标签。 */
  hideTreeSectionLabel?: boolean;
  /** 目录加载完成后自动选择第一项。 */
  defaultSelectFirst?: boolean;
  /** 完整文件树加载完成后回传给外层做文件重名等校验。 */
  onTreeLoaded?: (tree: FileTreeResponse) => void;
  /** 桌面版：允许通过系统目录选择器添加新的映射根目录。 */
  showOpenLocalFolder?: boolean;
  openLocalFolderBusy?: boolean;
  onOpenLocalFolder?: () => Promise<string | null>;
};

export const FolderPathPicker = memo(function FolderPathPicker({
  selectedFolderId,
  onSelectFolder,
  hidePicker = false,
  variant = "import",
  hideTreeSectionLabel = false,
  defaultSelectFirst = false,
  onTreeLoaded,
  showOpenLocalFolder = false,
  openLocalFolderBusy = false,
  onOpenLocalFolder,
}: FolderPathPickerProps) {
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {},
  );

  const refreshFolders = useCallback(() => {
    void ServerSync.listFileTree()
      .then((tree) => {
        setFolders(tree.folders);
        onTreeLoaded?.(tree);
      })
      .catch(() => setFolders([]));
  }, [onTreeLoaded]);

  useEffect(() => {
    if (hidePicker) {
      return;
    }
    refreshFolders();
  }, [hidePicker, refreshFolders]);

  const handleAddLocalFolder = useCallback(async () => {
    if (!onOpenLocalFolder || openLocalFolderBusy) {
      return;
    }
    const folderId = await onOpenLocalFolder();
    if (!folderId) {
      return;
    }
    onSelectFolder(folderId);
    refreshFolders();
    setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
  }, [
    onOpenLocalFolder,
    onSelectFolder,
    openLocalFolderBusy,
    refreshFolders,
  ]);

  const foldersByParent = useMemo(() => buildFoldersByParent(folders), [folders]);

  useEffect(() => {
    if (hidePicker || !defaultSelectFirst || selectedFolderId !== null) {
      return;
    }
    const firstFolder = foldersByParent.get(null)?.[0];
    if (firstFolder) {
      onSelectFolder(firstFolder.id);
    }
  }, [
    defaultSelectFirst,
    foldersByParent,
    hidePicker,
    onSelectFolder,
    selectedFolderId,
  ]);

  const renderTree = useCallback(
    (parentId: string | null, depth = 0): ReactNode => {
      const children = foldersByParent.get(parentId) ?? [];
      return children.map((folder) => {
        const hasChildren = (foldersByParent.get(folder.id) ?? []).length > 0;
        const expanded = expandedFolders[folder.id] ?? false;
        const active = selectedFolderId === folder.id;
        return (
          <div key={folder.id} className="filelist__tree-node">
            <div
              role="button"
              tabIndex={0}
              className={[
                "filelist__tree-row",
                active ? "filelist__tree-row--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ paddingLeft: `${0.35 + depth * 0.75}rem` }}
              onClick={() => onSelectFolder(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectFolder(folder.id);
                }
              }}
            >
              <button
                type="button"
                className="filelist__tree-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) {
                    setExpandedFolders((prev) => ({
                      ...prev,
                      [folder.id]: !expanded,
                    }));
                  }
                }}
                aria-expanded={hasChildren ? expanded : undefined}
                aria-label={expanded ? "折叠文件夹" : "展开文件夹"}
              >
                {hasChildren ? (
                  <span
                    className={`filelist__tree-chevron ${
                      expanded ? "filelist__tree-chevron--open" : ""
                    }`}
                  >
                    <SvgIcon d={ICON.chevron} size={14} />
                  </span>
                ) : (
                  <span className="filelist__tree-chevron" aria-hidden />
                )}
              </button>
              <span className="filelist__tree-name">
                <SvgIcon d={ICON.folder} size={16} />
                <span>{folder.name}</span>
              </span>
            </div>
            {expanded ? renderTree(folder.id, depth + 1) : null}
          </div>
        );
      });
    },
    [
      expandedFolders,
      foldersByParent,
      onSelectFolder,
      selectedFolderId,
    ],
  );

  if (hidePicker) {
    return null;
  }

  const hasExistingFolders = (foldersByParent.get(null) ?? []).length > 0;
  const isSaveVariant = variant === "save";
  const pickFolderTitle = isSaveVariant
    ? openLocalFolderBusy
      ? "正在选择…"
      : "选择磁盘目录…"
    : openLocalFolderBusy
    ? "添加中…"
    : "添加本地目录";
  const pickFolderDesc = isSaveVariant
    ? "在本地磁盘上选择保存目录；若尚未映射会自动加入左侧目录列表。"
    : "将新的本地文件夹加入左侧目录列表";
  const treeSectionLabel = isSaveVariant ? "目标文件夹" : "已有目录";
  const treeEmptyHint = isSaveVariant
    ? showOpenLocalFolder
      ? "暂无已映射目录。请先通过上方按钮选择磁盘目录，或返回主页添加本地目录。"
      : "暂无已映射目录。请先在左侧添加本地目录，或返回主页映射文件夹。"
    : "暂无已有目录。请先添加本地目录，或在桌面版映射文件夹后再选择。";

  return (
    <div className="filelist__folder-destination">
      {showOpenLocalFolder && onOpenLocalFolder ? (
        <div className="filelist__folder-destination-block">
          <button
            type="button"
            className="filelist__folder-destination-action filelist__folder-destination-action--add"
            disabled={openLocalFolderBusy}
            onClick={() => void handleAddLocalFolder()}
          >
            <span className="filelist__folder-destination-action-icon">
              <SvgIcon d={ICON.plus} size={16} />
            </span>
            <span className="filelist__folder-destination-action-copy">
              <span className="filelist__folder-destination-action-title">
                {pickFolderTitle}
              </span>
              <span className="filelist__folder-destination-action-desc">
                {pickFolderDesc}
              </span>
            </span>
          </button>
        </div>
      ) : null}

      <div className="filelist__folder-destination-block">
        {hasExistingFolders && !hideTreeSectionLabel ? (
          <div className="filelist__folder-destination-label">{treeSectionLabel}</div>
        ) : null}
        <div className="filelist__folder-destination-tree-shell">
          {!hasExistingFolders ? (
            <p className="filelist__folder-destination-empty">{treeEmptyHint}</p>
          ) : (
            <div
              className="filelist__tree filelist__tree--nested filelist__folder-path-picker"
              role="tree"
              aria-label={isSaveVariant ? "目标文件夹" : "已有目录"}
            >
              {renderTree(null, 0)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
