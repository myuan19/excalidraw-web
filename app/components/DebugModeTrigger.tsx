import { useEffect, useMemo, useRef, useState } from "react";

import {
  getAppSettings,
  subscribeAppSettings,
} from "../data/appSettings";
import {
  getDebugCapability,
  loadDebugCapability,
  setDebugLoggingEnabled,
  subscribeDebugCapability,
} from "../data/debugCapability";

const CLICK_THRESHOLD = 5;
const CLICK_WINDOW_MS = 1600;

function shortVersion(): string {
  const sha = window.__EXCALIDRAW_SHA__?.trim();
  if (sha) {
    return sha.slice(0, 7);
  }
  return import.meta.env.DEV ? "dev" : "build";
}

export function DebugModeTrigger() {
  const [capability, setCapability] = useState(getDebugCapability);
  const [settings, setSettings] = useState(getAppSettings);
  const clickCountRef = useRef(0);
  const resetTimerRef = useRef<number | null>(null);
  const version = useMemo(shortVersion, []);

  useEffect(() => {
    void loadDebugCapability();
    const unsubscribeCapability = subscribeDebugCapability(() => {
      setCapability(getDebugCapability());
    });
    const unsubscribeSettings = subscribeAppSettings(() => {
      setSettings(getAppSettings());
    });
    return () => {
      unsubscribeCapability();
      unsubscribeSettings();
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  if (!capability.allowed) {
    return null;
  }

  const enabled = settings.debugLoggingMode !== "off";

  return (
    <button
      type="button"
      className={`debug-mode-trigger${enabled ? " is-enabled" : ""}`}
      aria-label={enabled ? "Debug 日志已开启，点击版本号可关闭" : "连续点击版本号开启 Debug 日志"}
      title={enabled ? "Debug 日志已开启，点击关闭" : "连续点击 5 次开启 Debug 日志"}
      onClick={() => {
        if (enabled) {
          clickCountRef.current = 0;
          setDebugLoggingEnabled(false);
          return;
        }
        clickCountRef.current += 1;
        if (resetTimerRef.current != null) {
          window.clearTimeout(resetTimerRef.current);
        }
        resetTimerRef.current = window.setTimeout(() => {
          clickCountRef.current = 0;
          resetTimerRef.current = null;
        }, CLICK_WINDOW_MS);
        if (clickCountRef.current >= CLICK_THRESHOLD) {
          clickCountRef.current = 0;
          setDebugLoggingEnabled(true);
        }
      }}
    >
      <span className="debug-mode-trigger__version">v {version}</span>
      {enabled ? <span className="debug-mode-trigger__badge">Debug</span> : null}
    </button>
  );
}
