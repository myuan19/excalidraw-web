export type StartupPhase =
  | "pending"
  | "shell-ready"
  | "intent-resolved"
  | "loading-foreground"
  | "foreground-ready"
  | "enriching"
  | "catalog-synced"
  | "idle";

export type StartupShellMode = "home" | "editor";

export type StartupHomeIntent = {
  mode: "home";
  sidebarView: "recent" | "all";
  folderId: string | null;
};

export type StartupEditorIntent = {
  mode: "editor";
  fileId: string;
  kind: string;
  tabId?: string;
  needsSessionRestore: boolean;
};

export type StartupLibraryImportIntent = {
  mode: "library-import";
  sidebarView: "recent" | "all";
  folderId: string | null;
};

export type StartupIntent =
  | StartupHomeIntent
  | StartupEditorIntent
  | StartupLibraryImportIntent;

export function isStartupHomeIntent(
  intent: StartupIntent | null,
): intent is StartupHomeIntent | StartupLibraryImportIntent {
  return intent?.mode === "home" || intent?.mode === "library-import";
}

export function startupShellModeFromIntent(
  intent: StartupIntent | null,
): StartupShellMode {
  if (intent?.mode === "editor") {
    return "editor";
  }
  return "home";
}

export function isStartupPhaseAtLeast(
  phase: StartupPhase,
  target: StartupPhase,
): boolean {
  const order: StartupPhase[] = [
    "pending",
    "shell-ready",
    "intent-resolved",
    "loading-foreground",
    "foreground-ready",
    "enriching",
    "catalog-synced",
    "idle",
  ];
  return order.indexOf(phase) >= order.indexOf(target);
}
