import type { FC } from "react";

import {
  useFileListController,
  type FileListProps,
} from "../hooks/useFileListController";

export type { FileListProps };

export const FileList: FC<FileListProps> = (props) => {
  return useFileListController(props);
};
