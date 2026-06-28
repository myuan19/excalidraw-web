import { createRoot } from "react-dom/client";

import ExcalidrawApp from "./App";
import { initGlobalErrorCapture } from "./lib/logger";
import { installUserTraceGlobals } from "./lib/userTrace";
import { bootResourceTrace } from "./lib/resourceTrace";

initGlobalErrorCapture();
installUserTraceGlobals();
bootResourceTrace();

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

async function ensureBuildMatchesDeployMeta(): Promise<void> {
  if (!import.meta.env.PROD) {
    return;
  }
  const injectedSha = (import.meta.env.VITE_APP_GIT_SHA ?? "").trim();
  if (!injectedSha) {
    return;
  }
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const metaUrl = `${base}${base.endsWith("/") ? "" : "/"}build-meta.json`;
    const res = await fetch(metaUrl, { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const meta = (await res.json()) as { gitSha?: string };
    const deployedSha = (meta.gitSha ?? "").trim();
    if (!deployedSha || deployedSha === injectedSha) {
      return;
    }
    const reloadKey = "excalidraw-build-reload-once";
    if (sessionStorage.getItem(reloadKey) === deployedSha) {
      return;
    }
    sessionStorage.setItem(reloadKey, deployedSha);
    window.location.reload();
  } catch {
    // offline or missing build-meta.json on older deploys
  }
}

void ensureBuildMatchesDeployMeta();

const pwaEnabled = import.meta.env.VITE_APP_ENABLE_PWA === "true";

// If PWA is disabled, aggressively remove any previously-installed SW/cache
// from older deployments so stale bundles stop shadowing freshly deployed code.
if (!pwaEnabled) {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {
        // Electron custom protocol pages can reject SW access during early boot.
      });
  }
  if ("caches" in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {});
  }
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(<ExcalidrawApp />);
