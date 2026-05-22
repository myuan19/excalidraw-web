import { createRoot } from "react-dom/client";

import { initGlobalErrorCapture } from "../lib/logger";
import { TopErrorBoundary } from "../components/TopErrorBoundary";
import EmbedApp from "./EmbedApp";

import "../index.scss";

initGlobalErrorCapture();

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

root.render(
  <TopErrorBoundary>
    <EmbedApp />
  </TopErrorBoundary>,
);
