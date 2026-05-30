export type AppView = "home" | "editor" | "files" | "settings" | "users";

export function buildViewHash(view: Exclude<AppView, "editor">): string {
  return view === "home" ? "" : `view=${view}`;
}
