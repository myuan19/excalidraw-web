import path from "path";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgrPlugin from "vite-plugin-svgr";
import { ViteEjsPlugin } from "vite-plugin-ejs";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import Sitemap from "vite-plugin-sitemap";

import { woff2BrowserPlugin } from "../scripts/woff2/woff2-vite-plugins";
import { writeBuildMetaPlugin } from "./lib/writeBuildMetaPlugin";

/** Legacy in-repo dev data paths — exclude from Vite HMR if present */
const devDataDir = path.resolve(__dirname, "../_dev_data");
const legacyServerDataDir = path.resolve(__dirname, "../server/data");

export default defineConfig(({ mode }) => {
  // To load .env variables
  const envVars = loadEnv(mode, `../`);
  const pwaEnabled = envVars.VITE_APP_ENABLE_PWA === "true";
  /** Forward `/api/*` to local Express (`server`, default :3033). */
  const apiProxyTarget =
    envVars.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:3033";
  const apiProxy = {
    "/api": {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  /** 与 `package.json` 的 `homepage: "."` 一致；相对路径避免部署在子路径时请求根 `/assets/…` 导致 404。可用 `VITE_BASE_PATH=/` 显式用绝对根路径。 */
  const appBase = (() => {
    const raw = (envVars.VITE_BASE_PATH ?? "").trim();
    if (raw.length > 0) {
      if (raw === "/" || raw === "./") {
        return raw;
      }
      if (raw.startsWith("/")) {
        return raw.endsWith("/") ? raw : `${raw}/`;
      }
      return raw.endsWith("/") ? raw : `${raw}/`;
    }
    return "./";
  })();

  // https://vitejs.dev/config/
  return {
    base: appBase,
    server: {
      port: Number(envVars.VITE_APP_PORT || 3000),
      open: true,
      watch: {
        ignored: [`${devDataDir}/**`, `${legacyServerDataDir}/**`],
      },
      proxy: apiProxy,
    },
    preview: {
      port: Number(envVars.VITE_PREVIEW_PORT || envVars.VITE_APP_PORT || 3001),
      proxy: apiProxy,
    },
    // We need to specify the envDir since now there are no
    //more located in parallel with the vite.config.ts file but in parent dir
    envDir: "../",
    resolve: {
      alias: [
        {
          find: /^@excalidraw\/common$/,
          replacement: path.resolve(
            __dirname,
            "../packages/common/src/index.ts",
          ),
        },
        {
          find: /^@excalidraw\/common\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/common/src/$1"),
        },
        {
          find: /^@excalidraw\/element$/,
          replacement: path.resolve(
            __dirname,
            "../packages/element/src/index.ts",
          ),
        },
        {
          find: /^@excalidraw\/element\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/element/src/$1"),
        },
        {
          find: /^@excalidraw\/excalidraw$/,
          replacement: path.resolve(
            __dirname,
            "../packages/excalidraw/index.tsx",
          ),
        },
        {
          find: /^@excalidraw\/excalidraw\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/excalidraw/$1"),
        },
        {
          find: /^@excalidraw\/math$/,
          replacement: path.resolve(__dirname, "../packages/math/src/index.ts"),
        },
        {
          find: /^@excalidraw\/math\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/math/src/$1"),
        },
        {
          find: /^@excalidraw\/utils$/,
          replacement: path.resolve(
            __dirname,
            "../packages/utils/src/index.ts",
          ),
        },
        {
          find: /^@excalidraw\/utils\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/utils/src/$1"),
        },
      ],
    },
    build: {
      outDir: "build",
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          embed: path.resolve(__dirname, "embed/index.html"),
        },
        output: {
          assetFileNames(chunkInfo) {
            if (chunkInfo?.name?.endsWith(".woff2")) {
              const family = chunkInfo.name.split("-")[0];
              return `fonts/${family}/[name][extname]`;
            }

            return "assets/[name]-[hash][extname]";
          },
          // Creating separate chunk for locales except for en and percentages.json so they
          // can be cached at runtime and not merged with
          // app precache. en.json and percentages.json are needed for first load
          // or fallback hence not clubbing with locales so first load followed by offline mode works fine. This is how CRA used to work too.
          manualChunks(id) {
            if (
              id.includes("packages/excalidraw/locales") &&
              id.match(/en.json|percentages.json/) === null
            ) {
              const index = id.indexOf("locales/");
              // Taking the substring after "locales/"
              return `locales/${id.substring(index + 8)}`;
            }

            if (id.includes("@excalidraw/mermaid-to-excalidraw")) {
              return "mermaid-to-excalidraw";
            }

            if (id.includes("@codemirror/") || id.includes("@lezer/")) {
              return "codemirror.chunk";
            }
          },
        },
      },
      sourcemap: true,
      // don't auto-inline small assets (i.e. fonts hosted on CDN)
      assetsInlineLimit: 0,
    },
    plugins: [
      writeBuildMetaPlugin(path.resolve(__dirname, "build")),
      Sitemap({
        hostname: "https://excalidraw.com",
        outDir: "build",
        changefreq: "monthly",
        // its static in public folder
        generateRobotsTxt: false,
      }),
      woff2BrowserPlugin(),
      react(),
      checker({
        typescript: true,
        eslint:
          envVars.VITE_APP_ENABLE_ESLINT === "false"
            ? undefined
            : { lintCommand: 'eslint "./**/*.{js,ts,tsx}"' },
        overlay: {
          initialIsOpen: envVars.VITE_APP_COLLAPSE_OVERLAY === "false",
          badgeStyle: "margin-bottom: 4rem; margin-left: 1rem",
        },
      }),
      svgrPlugin(),
      ViteEjsPlugin(),
      ...(pwaEnabled
        ? [
            VitePWA({
              registerType: "autoUpdate",
              devOptions: {
                enabled: true,
              },
              workbox: {
                globIgnores: [
                  "fonts.css",
                  "**/locales/**",
                  "service-worker.js",
                  "**/*.chunk-*.js",
                  "**/CodeMirrorEditor-*.js",
                ],
                runtimeCaching: [
                  {
                    urlPattern: new RegExp(".+.woff2"),
                    handler: "CacheFirst",
                    options: {
                      cacheName: "fonts",
                      expiration: {
                        maxEntries: 1000,
                        maxAgeSeconds: 60 * 60 * 24 * 90,
                      },
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                    },
                  },
                  {
                    urlPattern: new RegExp("fonts.css"),
                    handler: "StaleWhileRevalidate",
                    options: {
                      cacheName: "fonts",
                      expiration: {
                        maxEntries: 50,
                      },
                    },
                  },
                  {
                    urlPattern: new RegExp("locales/[^/]+.js"),
                    handler: "CacheFirst",
                    options: {
                      cacheName: "locales",
                      expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 60 * 60 * 24 * 30,
                      },
                    },
                  },
                  {
                    urlPattern: new RegExp("(.chunk-.+|CodeMirrorEditor-.+)\\.js"),
                    handler: "CacheFirst",
                    options: {
                      cacheName: "chunk",
                      expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 60 * 60 * 24 * 90,
                      },
                    },
                  },
                ],
                maximumFileSizeToCacheInBytes: 2.3 * 1024 ** 2,
              },
              manifest: {
                short_name: "绘图空间",
                name: "绘图空间",
                description:
                  "统一管理 excalidraw 与 mindmap。",
                icons: [
                  {
                    src: "android-chrome-192x192.png",
                    sizes: "192x192",
                    type: "image/png",
                  },
                  {
                    src: "apple-touch-icon.png",
                    type: "image/png",
                    sizes: "180x180",
                  },
                  {
                    src: "favicon-32x32.png",
                    sizes: "32x32",
                    type: "image/png",
                  },
                  {
                    src: "favicon-16x16.png",
                    sizes: "16x16",
                    type: "image/png",
                  },
                ],
                start_url: "/",
                id: "excalidraw",
                display: "standalone",
                theme_color: "#121212",
                background_color: "#ffffff",
                file_handlers: [
                  {
                    action: "/",
                    accept: {
                      "application/vnd.excalidraw+json": [".excalidraw"],
                    },
                  },
                ],
                share_target: {
                  action: "/web-share-target",
                  method: "POST",
                  enctype: "multipart/form-data",
                  params: {
                    files: [
                      {
                        name: "file",
                        accept: [
                          "application/vnd.excalidraw+json",
                          "application/json",
                          ".excalidraw",
                        ],
                      },
                    ],
                  },
                },
                screenshots: [
                  {
                    src: "/screenshots/virtual-whiteboard.png",
                    type: "image/png",
                    sizes: "462x945",
                  },
                  {
                    src: "/screenshots/wireframe.png",
                    type: "image/png",
                    sizes: "462x945",
                  },
                  {
                    src: "/screenshots/illustration.png",
                    type: "image/png",
                    sizes: "462x945",
                  },
                  {
                    src: "/screenshots/shapes.png",
                    type: "image/png",
                    sizes: "462x945",
                  },
                  {
                    src: "/screenshots/collaboration.png",
                    type: "image/png",
                    sizes: "462x945",
                  },
                  {
                    src: "/screenshots/export.png",
                    type: "image/png",
                    sizes: "462x945",
                  },
                ],
              },
            }),
          ]
        : []),
      createHtmlPlugin({
        minify: true,
      }),
    ],
    publicDir: "../public",
  };
});
