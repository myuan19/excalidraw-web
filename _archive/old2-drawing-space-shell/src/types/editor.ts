export interface EditorAdapter {
  id: string;
  displayName: string;
  icon: string;
  supportedFormats: string[];

  mount(container: HTMLElement): void;
  unmount(): void;
  /** Immediate teardown when switching editor implementations. */
  unmountSync?(): void;
  resize?(): void;
  setFileContext?(fileId: string | null): void;

  loadData(raw: ArrayBuffer | string): Promise<void>;
  saveData(): Promise<{ data: Blob; format: string }>;

  getThumbnail(width: number, height: number): Promise<Blob>;

  onDidChange?(handler: (data: unknown) => void): () => void;

  getToolbar?(): React.ReactNode;

  onAIGenerate?(prompt: string): Promise<void>;
}

export interface EditorMeta {
  id: string;
  displayName: string;
  icon: string;
  supportedFormats: string[];
  /** 创建文件时使用的 kind，默认等于 id */
  fileKind?: string;
  /** 主页快捷入口标题，默认 displayName */
  homeLabel?: string;
  /** 主页快捷入口副标题 */
  homeTagline?: string;
  /** 主页排序，越小越靠前 */
  homeOrder?: number;
  /** 是否在主页展示快捷入口，默认 true */
  showOnHome?: boolean;
}
