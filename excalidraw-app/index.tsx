import { createRoot } from "react-dom/client";

import ExcalidrawApp from "./App";
import { initClientRemoteLog } from "./data/clientRemoteLog";

initClientRemoteLog();

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

const pwaEnabled = import.meta.env.VITE_APP_ENABLE_PWA === "true";

// If PWA is disabled, aggressively remove any previously-installed SW/cache
// from older deployments so stale bundles stop shadowing freshly deployed code.
if (!pwaEnabled) {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((regs) =>
      Promise.all(regs.map((r) => r.unregister())),
    );
  }
  if ("caches" in window) {
    void caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k))),
    );
  }
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(<ExcalidrawApp />);
