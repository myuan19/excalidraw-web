declare module "simple-mind-map" {
  type MindMapOptions = {
    el: HTMLElement;
    data?: unknown;
    layout?: string;
    theme?: string;
    themeConfig?: Record<string, unknown>;
    viewData?: unknown;
    initRootNodePosition?: [string, string];
  };

  type MindMapEventHandler = (...args: unknown[]) => void;

  export default class MindMap {
    constructor(options: MindMapOptions);
    getData(withConfig?: boolean): unknown;
    setFullData(data: unknown): void;
    destroy(): void;
    execCommand(name: string, ...args: unknown[]): void;
    on(eventName: string, handler: MindMapEventHandler): void;
    off(eventName: string, handler: MindMapEventHandler): void;
  }
}
