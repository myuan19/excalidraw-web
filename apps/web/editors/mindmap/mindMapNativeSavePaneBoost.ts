const PANE_SAVE_ACTIVE = "editor-pane-stack__pane--save-active";
const CACHE_PANE_SAVE_ACTIVE = "editor-tab-cache-pane--save-active";
const PLATFORM_SHELL_SAVE_ACTIVE = "editor-platform-shell--save-active";

type BoostTarget = {
  element: Element;
  className: string;
};

function collectBoostTargets(shellRoot: HTMLElement): BoostTarget[] {
  const targets: BoostTarget[] = [];
  const pane = shellRoot.closest(".editor-pane-stack__pane");
  if (pane) {
    targets.push({ element: pane, className: PANE_SAVE_ACTIVE });
  }
  const cachePane = shellRoot.closest(".editor-tab-cache-pane");
  if (cachePane && cachePane !== pane) {
    targets.push({ element: cachePane, className: CACHE_PANE_SAVE_ACTIVE });
  }
  const platformShell = shellRoot.closest(".editor-platform-shell");
  if (platformShell) {
    targets.push({
      element: platformShell,
      className: PLATFORM_SHELL_SAVE_ACTIVE,
    });
  }
  return targets;
}

/**
 * Cached editor panes use visibility:hidden so iframe timers/layout stall.
 * Reveal them at the same stacking level as keep-running panes during native save.
 */
export function beginMindMapNativeSavePaneBoost(
  shellRoot: HTMLElement | null,
  isPaneForeground: boolean,
): () => void {
  if (!shellRoot || isPaneForeground) {
    return () => {};
  }
  const boosted: BoostTarget[] = [];
  for (const target of collectBoostTargets(shellRoot)) {
    target.element.classList.add(target.className);
    boosted.push(target);
  }
  return () => {
    for (const target of boosted) {
      target.element.classList.remove(target.className);
    }
  };
}

export const mindMapNativeSavePaneBoostClasses = {
  pane: PANE_SAVE_ACTIVE,
  cachePane: CACHE_PANE_SAVE_ACTIVE,
  platformShell: PLATFORM_SHELL_SAVE_ACTIVE,
} as const;

export async function waitForMindMapNativeSavePaneBoost(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
      return;
    }
    window.setTimeout(resolve, 32);
  });
}
