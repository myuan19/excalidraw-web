export type SaveToServerSource = "toolbar" | "hotkey" | "visibility" | "home";

export type SaveToServerOptions = {
  source?: SaveToServerSource;
  navigateAfter?: boolean;
  forceThumbnail?: boolean;
};

export type SceneData = {
  elements: any;
  appState: any;
  files: any;
};
