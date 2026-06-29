import { editorRegistry } from "../editors";
import { devDebug } from "../lib/devDebug";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import {
  reconcileEditorTabsWithHash,
  restoreDesktopEditorSession,
} from "../shell/editorTabNavigation";

import { PriorityTaskQueue } from "./PriorityTaskQueue";
import { resolveStartupIntent, peekStartupShellMode } from "./StartupIntent";
import {
  isStartupHomeIntent,
  type StartupIntent,
  type StartupPhase,
} from "./startupPhases";

export const STARTUP_LOAD_HOME_TREE_EVENT = "editorhub:startup-load-home-tree";
export const STARTUP_HOME_TREE_READY_EVENT = "editorhub:startup-home-tree-ready";

type HomeTreeLoader = () => Promise<void>;
type IdleTask = () => Promise<void>;

function runAfterFirstPaint(task: () => void): () => void {
  let innerId = 0;
  const outerId = requestAnimationFrame(() => {
    innerId = requestAnimationFrame(task);
  });
  return () => {
    cancelAnimationFrame(outerId);
    if (innerId) {
      cancelAnimationFrame(innerId);
    }
  };
}

class StartupCoordinatorImpl {
  private phase: StartupPhase = "pending";
  private intent: StartupIntent | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly queue = new PriorityTaskQueue({ lightMaxConcurrency: 1 });
  private started = false;
  private coldStart = true;
  private homeTreeLoader: HomeTreeLoader | null = null;
  private resolveHomeTreeReady: (() => void) | null = null;
  private idleTasks: IdleTask[] = [];
  private shellReadyAt = 0;

  getPhase(): StartupPhase {
    return this.phase;
  }

  getIntent(): StartupIntent | null {
    return this.intent;
  }

  isColdStart(): boolean {
    return this.coldStart;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  registerHomeTreeLoader(loader: HomeTreeLoader): () => void {
    this.homeTreeLoader = loader;
    return () => {
      if (this.homeTreeLoader === loader) {
        this.homeTreeLoader = null;
      }
    };
  }

  registerIdleTask(task: IdleTask): void {
    this.idleTasks.push(task);
  }

  enqueueLightTask(task: {
    id: string;
    priority: number;
    coalesceKey?: string;
    run: () => Promise<void>;
  }): void {
    this.queue.enqueueLight(task);
  }

  notifyHomeTreeReady(): void {
    window.dispatchEvent(new CustomEvent(STARTUP_HOME_TREE_READY_EVENT));
    this.resolveHomeTreeReady?.();
    this.resolveHomeTreeReady = null;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    runAfterFirstPaint(() => {
      this.shellReadyAt = performance.now();
      this.setPhase("shell-ready");
      try {
        performance.mark("startup:shell-ready");
      } catch {
        /* ignore */
      }

      this.intent = resolveStartupIntent();
      devDebug("startup", "intent-resolved", {
        intent: this.intent,
        sinceShellMs: Math.round(performance.now() - this.shellReadyAt),
      });
      this.setPhase("intent-resolved");
      void this.runForegroundPipeline();
    });
  }

  completeColdStart(): void {
    this.coldStart = false;
  }

  private setPhase(next: StartupPhase): void {
    if (this.phase === next) {
      return;
    }
    this.phase = next;
    devDebug("startup", "phase", {
      phase: next,
      sinceShellMs: this.shellReadyAt
        ? Math.round(performance.now() - this.shellReadyAt)
        : null,
    });
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async runForegroundPipeline(): Promise<void> {
    if (!this.intent) {
      this.setPhase("idle");
      this.completeColdStart();
      return;
    }

    this.setPhase("loading-foreground");
    try {
      if (this.intent.mode === "editor") {
        await this.runEditorForeground(this.intent);
      } else {
        await this.runHomeForeground();
      }
    } catch (error) {
      devDebug("startup", "foreground-failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.setPhase("foreground-ready");
    this.setPhase("enriching");

    if (isStartupHomeIntent(this.intent)) {
      // Home foreground already loaded the tree in runHomeForeground.
    } else {
      window.dispatchEvent(new CustomEvent(STARTUP_LOAD_HOME_TREE_EVENT));
    }

    this.setPhase("catalog-synced");
    void this.runIdleTasks();
    this.setPhase("idle");
    this.completeColdStart();
  }

  private async runEditorForeground(intent: Extract<
    StartupIntent,
    { mode: "editor" }
  >): Promise<void> {
    if (intent.needsSessionRestore && isDesktopEditorHub()) {
      restoreDesktopEditorSession();
    }
    reconcileEditorTabsWithHash(window.location.hash);
    const plugin = editorRegistry.getByKind(intent.kind);
    if (plugin) {
      await plugin.loadEditorShell();
    }
  }

  private async runHomeForeground(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.resolveHomeTreeReady = resolve;
      if (this.homeTreeLoader) {
        void this.homeTreeLoader()
          .catch(() => undefined)
          .finally(() => {
            this.notifyHomeTreeReady();
          });
        return;
      }
      window.dispatchEvent(new CustomEvent(STARTUP_LOAD_HOME_TREE_EVENT));
    });
  }

  private async runIdleTasks(): Promise<void> {
    for (const task of this.idleTasks) {
      this.queue.enqueueIdle({
        id: `idle-${this.idleTasks.indexOf(task)}`,
        priority: 0,
        run: task,
      });
    }
    editorRegistry.prefetchOnFileListReady();
  }
}

let coordinatorSingleton: StartupCoordinatorImpl | null = null;

export function getStartupCoordinator(): StartupCoordinatorImpl {
  if (!coordinatorSingleton) {
    coordinatorSingleton = new StartupCoordinatorImpl();
  }
  return coordinatorSingleton;
}

/** @internal test helper */
export function resetStartupCoordinatorForTests(): void {
  coordinatorSingleton = null;
}

export function startStartupCoordinator(): void {
  getStartupCoordinator().start();
}

export function notifyStartupHomeTreeReady(): void {
  getStartupCoordinator().notifyHomeTreeReady();
}

export function enqueueStartupLightTask(task: {
  id: string;
  priority: number;
  coalesceKey?: string;
  run: () => Promise<void>;
}): void {
  getStartupCoordinator().enqueueLightTask(task);
}
