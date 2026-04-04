// Self-destructing service worker for dev mode.
//
// vite-plugin-pwa generates the real sw.js into excalidraw-app/build/ at
// build time, overwriting this file in the output directory. So production
// deployments are unaffected.
//
// In dev mode Vite serves this from publicDir at /sw.js. If a stale
// production SW (from a previous `--fast` / `vite preview` session) is
// still registered, the browser's byte-for-byte update check will detect
// this new version, install it, and it will:
//   1. Activate immediately (skipWaiting)
//   2. Clear all Cache Storage entries (precache + runtime caches)
//   3. Unregister itself
//   4. Reload every open tab so they get fresh content from the dev server
//
// Same pattern as public/service-worker.js (CRA→Vite migration).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        self.registration.unregister();
        clients.forEach((client) => client.navigate(client.url));
      }),
  );
});
