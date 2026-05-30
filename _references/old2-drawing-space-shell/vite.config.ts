import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: new URL("./index.html", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    entries: ["index.html"],
    exclude: ["_old", "_resources"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3033",
        // Keep the browser-facing host so same-origin protected APIs work in dev.
        changeOrigin: false,
      },
      "/embed": {
        target: "http://127.0.0.1:3033",
        changeOrigin: false,
      },
    },
    watch: {
      ignored: ["**/_old/**", "**/_resources/**"],
    },
  },
});
