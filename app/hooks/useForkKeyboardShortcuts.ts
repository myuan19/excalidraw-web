import { useEffect } from "react";

import { createLogger } from "../lib/logger";
import { getFileIdFromHash } from "../data/fileIdFromHash";

import type { SaveToServerOptions } from "./types";

const logHook = createLogger({ module: "hook.keyboard" });

export function useForkKeyboardShortcuts(
  saveToServerRef: React.MutableRefObject<
    (opts?: SaveToServerOptions) => Promise<boolean>
  >,
) {
  useEffect(() => {
    logHook.info("mounted — Ctrl+S listener registered");
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "s") {
        return;
      }
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e as KeyboardEvent & { isComposing?: boolean }).isComposing
      ) {
        return;
      }
      if (!getFileIdFromHash()) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      logHook.info("Ctrl+S triggered save");
      void saveToServerRef.current?.({ source: "hotkey" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [saveToServerRef]);
}
