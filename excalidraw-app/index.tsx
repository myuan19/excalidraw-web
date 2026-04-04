import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import ExcalidrawApp from "./App";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

// Belt-and-suspenders: if code reaches here in dev (e.g. user did
// Ctrl+Shift+R to bypass stale SW), eagerly nuke any leftover SW &
// caches so the *next* normal refresh is also clean.
// The primary fix lives in public/sw.js (self-destructing SW).
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_APP_ENABLE_PWA !== "true"
) {
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
registerSW({ immediate: true });
root.render(<ExcalidrawApp />);
