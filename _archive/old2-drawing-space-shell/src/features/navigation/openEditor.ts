import {
  openDocumentById,
  openDocumentFile,
  type OpenDocumentOptions,
} from "@/features/files/openDocumentFile";
import {
  createAndOpenTempFile,
  requestNewFromFiles,
} from "@/features/files/startNewTempFile";
import { showEditorView } from "@/features/navigation/showEditorView";
import { useEditorStore } from "@/stores/editorStore";
import type { ServerFile } from "@/types/file";

export type OpenEditorTarget =
  | { type: "file"; file: ServerFile; options?: OpenDocumentOptions }
  | { type: "fileId"; fileId: string; options?: OpenDocumentOptions }
  | { type: "newTemp"; kind: string }
  | { type: "picker" }
  | { type: "session" };

/**
 * 统一打开编辑器：先切到 EditorLayer，再加载内容或展示选择页。
 * 所有「打开文件 / 新建 / 恢复会话」应经此入口。
 */
export async function openEditor(target: OpenEditorTarget): Promise<ServerFile | null> {
  showEditorView();

  switch (target.type) {
    case "file":
      await openDocumentFile(target.file, target.options);
      return target.file;
    case "fileId":
      return openDocumentById(target.fileId, target.options);
    case "newTemp":
      await createAndOpenTempFile(target.kind);
      return useEditorStore.getState().activeFile;
    case "picker":
      requestNewFromFiles();
      return null;
    case "session":
      return useEditorStore.getState().activeFile;
    default:
      return null;
  }
}
