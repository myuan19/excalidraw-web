/** 新建文档在 UI 与标签页中的默认显示名（不含编辑器类型后缀）。 */
export const DEFAULT_DOCUMENT_DISPLAY_NAME = "未命名";

export function defaultNameForDocumentKind(_kind: string): string {
  return DEFAULT_DOCUMENT_DISPLAY_NAME;
}
