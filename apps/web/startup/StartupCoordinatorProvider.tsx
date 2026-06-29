import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { peekStartupShellMode } from "./StartupIntent";
import {
  getStartupCoordinator,
  startStartupCoordinator,
} from "./StartupCoordinator";
import {
  isStartupPhaseAtLeast,
  startupShellModeFromIntent,
  type StartupIntent,
  type StartupPhase,
} from "./startupPhases";

type StartupContextValue = {
  phase: StartupPhase;
  intent: StartupIntent | null;
  shellMode: "home" | "editor";
  isColdStart: boolean;
};

const StartupContext = createContext<StartupContextValue>({
  phase: "pending",
  intent: null,
  shellMode: peekStartupShellMode(),
  isColdStart: true,
});

export function StartupCoordinatorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const coordinator = getStartupCoordinator();
  const [snapshot, setSnapshot] = useState(() => ({
    phase: coordinator.getPhase(),
    intent: coordinator.getIntent(),
    isColdStart: coordinator.isColdStart(),
  }));

  useEffect(() => {
    startStartupCoordinator();
    coordinator.registerIdleTask(async () => {
      const { ensureAIConfigLoaded } = await import("../data/aiConfig");
      await ensureAIConfigLoaded().catch(() => undefined);
    });
    return coordinator.subscribe(() => {
      setSnapshot({
        phase: coordinator.getPhase(),
        intent: coordinator.getIntent(),
        isColdStart: coordinator.isColdStart(),
      });
    });
  }, [coordinator]);

  const value = useMemo(
    (): StartupContextValue => ({
      phase: snapshot.phase,
      intent: snapshot.intent,
      shellMode: snapshot.intent
        ? startupShellModeFromIntent(snapshot.intent)
        : peekStartupShellMode(),
      isColdStart: snapshot.isColdStart,
    }),
    [snapshot.intent, snapshot.isColdStart, snapshot.phase],
  );

  return (
    <StartupContext.Provider value={value}>{children}</StartupContext.Provider>
  );
}

export function useStartupContext(): StartupContextValue {
  return useContext(StartupContext);
}

export function useStartupPhase(): StartupPhase {
  return useStartupContext().phase;
}

export function useStartupShellMode(): "home" | "editor" {
  return useStartupContext().shellMode;
}

export function useStartupColdStart(): boolean {
  return useStartupContext().isColdStart;
}

/** P0–P1: file list renders layout only, no tree cache / refresh. */
export function useStartupFileListGate() {
  const { phase, isColdStart } = useStartupContext();
  return {
    isColdStart,
    skipInitialCache: isColdStart,
    showBootstrapSkeleton:
      isColdStart &&
      !isStartupPhaseAtLeast(phase, "foreground-ready"),
    canRefreshTree:
      !isColdStart || isStartupPhaseAtLeast(phase, "loading-foreground"),
    canFetchThumbnails:
      !isColdStart || isStartupPhaseAtLeast(phase, "enriching"),
    canLoadAiConfig:
      !isColdStart || isStartupPhaseAtLeast(phase, "idle"),
  };
}

/** Foreground editor panes mount after coordinator preloads shell chunk. */
export function useStartupForegroundEditorGate(isForeground: boolean): boolean {
  const { phase, isColdStart } = useStartupContext();
  if (!isForeground) {
    return false;
  }
  if (!isColdStart) {
    return true;
  }
  return isStartupPhaseAtLeast(phase, "foreground-ready");
}

/** Background editor tabs wait until idle unless they have unsaved state. */
export function useStartupBackgroundEditorGate(
  isForeground: boolean,
  keepRunning: boolean,
): boolean {
  const { phase, isColdStart } = useStartupContext();
  if (isForeground) {
    return isStartupPhaseAtLeast(phase, "foreground-ready") || !isColdStart;
  }
  if (!keepRunning) {
    return false;
  }
  if (!isColdStart) {
    return true;
  }
  return isStartupPhaseAtLeast(phase, "idle");
}

export function useStartupWebEditorGate(): boolean {
  const { phase, isColdStart, intent } = useStartupContext();
  if (!isColdStart) {
    return true;
  }
  if (intent?.mode !== "editor") {
    return true;
  }
  return isStartupPhaseAtLeast(phase, "foreground-ready");
}

export function useRegisterStartupHomeTreeLoader(
  loader: (() => Promise<void>) | undefined,
): void {
  const coordinator = getStartupCoordinator();
  useEffect(() => {
    if (!loader) {
      return undefined;
    }
    return coordinator.registerHomeTreeLoader(loader);
  }, [coordinator, loader]);
}
