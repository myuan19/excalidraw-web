import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ServerSync, type ServerFolder } from "../data/ServerSync";

import "./fileListDialogHost.scss";

function SvgIcon({
  d,
  size = 16,
}: {
  d: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const ICON = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  folder:
    "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  chevron: "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z",
} as const;

function buildFoldersByParent(folders: ServerFolder[]) {
  const byParent = new Map<string | null, ServerFolder[]>();
  for (const folder of folders) {
    const parent = folder.parent_id ?? null;
    const list = byParent.get(parent) ?? [];
    list.push(folder);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }
  return byParent;
}

type FolderPathPickerProps = {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  /** 为 true 时不展示树（目标文件夹已确定）。 */
  hidePicker?: boolean;
};

export const FolderPathPicker = memo(function FolderPathPicker({
  selectedFolderId,
  onSelectFolder,
  hidePicker = false,
}: FolderPathPickerProps) {
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (hidePicker) {
      return;
    }
    void ServerSync.listFileTree()
      .then((tree) => setFolders(tree.folders))
      .catch(() => setFolders([]));
  }, [hidePicker]);

  const foldersByParent = useMemo(() => buildFoldersByParent(folders), [folders]);

  const renderTree = useCallback(
    (parentId: string | null, depth = 0): ReactNode => {
      const children = foldersByParent.get(parentId) ?? [];
      return children.map((folder) => {
        const hasChildren = (foldersByParent.get(folder.id) ?? []).length > 0;
        const expanded = expandedFolders[folder.id] ?? true;
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

  return (
    <div
      className="filelist__tree filelist__tree--nested filelist__folder-path-picker"
      role="tree"
      aria-label="选择保存位置"
    >
      <button
        type="button"
        className={[
          "filelist__tree-root",
          selectedFolderId === null ? "filelist__tree-root--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onSelectFolder(null)}
      >
        <SvgIcon d={ICON.home} size={16} />
        <span>所有文件</span>
      </button>
      {renderTree(null, 0)}
    </div>
  );
});
