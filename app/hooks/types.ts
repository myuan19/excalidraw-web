export type SaveToServerSource =
  | "toolbar"
  | "hotkey"
  | "visibility"
  | "home"
  | "sidebar"
  | "auto"
  | "thumbnail";

export type SaveToServerOptions = {
  source?: SaveToServerSource;
  navigateAfter?: boolean;
  forceThumbnail?: boolean;
  requiresFreshSnapshot?: boolean;
};

export type SceneData = {
  elements: any;
  appState: any;
  files: any;
};
