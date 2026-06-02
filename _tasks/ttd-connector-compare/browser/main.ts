import { DEFAULT_EXPORT_PADDING } from "@excalidraw/common";
import { exportToCanvas } from "@excalidraw/utils";

import "../../../packages/excalidraw/polyfill.ts";

import { buildCompareVariants } from "../comparePipeline";
import sampleMermaid from "../sample.mermaid?raw";

declare global {
  interface Window {
    __COMPARE_READY__?: boolean;
    __COMPARE_META__?: Record<string, unknown>;
  }
}

const PANEL_WIDTH = 520;

const renderPanel = async (
  container: HTMLElement,
  title: string,
  elements: Parameters<typeof exportToCanvas>[0]["elements"],
  files: Parameters<typeof exportToCanvas>[0]["files"],
) => {
  const heading = document.createElement("h2");
  heading.textContent = title;
  container.appendChild(heading);

  const wrap = document.createElement("div");
  wrap.className = "canvas-wrap";
  wrap.style.width = `${PANEL_WIDTH}px`;
  container.appendChild(wrap);

  const canvas = await exportToCanvas({
    elements,
    files,
    exportPadding: DEFAULT_EXPORT_PADDING,
    maxWidthOrHeight: PANEL_WIDTH * window.devicePixelRatio,
    appState: {
      exportBackground: true,
      viewBackgroundColor: "#ffffff",
    },
  });

  wrap.appendChild(canvas);
};

const main = async () => {
  const status = document.getElementById("status");
  const {
    gitHeadElements,
    sharpElements,
    currentElements,
    files,
    connectorStats,
    mermaid,
    gitHeadCommit,
  } = await buildCompareVariants(sampleMermaid);

  const describeConnectors = (
    elements: Parameters<typeof exportToCanvas>[0]["elements"],
    includePoints = false,
  ) =>
    elements
      .filter((e) => e.type === "arrow" || e.type === "line")
      .map((e) => ({
        id: e.id,
        type: e.type,
        pointCount: e.points.length,
        elbowed: "elbowed" in e ? e.elbowed : null,
        roundness: e.roundness ?? null,
        renderOnlyRoundedPolyline:
          e.customData?.renderOnlyRoundedPolyline ?? null,
        ...(includePoints
          ? {
              points: e.points.map((p) => [
                Math.round(p[0] * 10) / 10,
                Math.round(p[1] * 10) / 10,
              ]),
            }
          : {}),
      }));

  await renderPanel(
    document.getElementById("git-head")!,
    `① Git 原始（${gitHeadCommit}，无 softenConnectorCorners）`,
    gitHeadElements,
    files,
  );
  await renderPanel(
    document.getElementById("sharp")!,
    "② 直角参考（去掉 Mermaid roundness）",
    sharpElements,
    files,
  );
  await renderPanel(
    document.getElementById("current")!,
    "③ 少点实验（② 走线 + 渲染时局部圆角）",
    currentElements,
    files,
  );

  window.__COMPARE_META__ = {
    mermaid,
    gitHeadCommit,
    connectorStats,
    connectors: {
      gitHead: describeConnectors(gitHeadElements, true),
      sharp: describeConnectors(sharpElements, true),
      current: describeConnectors(currentElements, true),
    },
  };
  window.__COMPARE_READY__ = true;
  if (status) {
    status.textContent = "渲染完成";
  }
};

main().catch((err) => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `渲染失败: ${err instanceof Error ? err.message : String(err)}`;
  }
  console.error(err);
});
