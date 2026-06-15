import { exportToSvg } from "@excalidraw/excalidraw/scene/export";
import { registerLibraryAIActions } from "@excalidraw/excalidraw/data/libraryAIActions";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { ensureAIConfigLoaded, isAIConfigured } from "./aiConfig";
import { openAIIconTag } from "./openaiCompatibleStream";

const CONCURRENCY = 3;
const PNG_SIZE = 512;

async function elementsToPngDataUrl(
  elements: readonly unknown[],
): Promise<string> {
  const elems = elements as readonly NonDeletedExcalidrawElement[];
  if (!elems.length) {
    throw new Error("Empty elements array");
  }
  const svgEl = await exportToSvg(
    elems,
    {
      exportBackground: true,
      viewBackgroundColor: "#ffffff",
      exportPadding: 10,
    },
    null,
  );

  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG to Image conversion failed"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    const scale = Math.min(
      PNG_SIZE / (img.width || 1),
      PNG_SIZE / (img.height || 1),
      1,
    );
    canvas.width = Math.max(1, Math.round((img.width || 100) * scale));
    canvas.height = Math.max(1, Math.round((img.height || 100) * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function generateIconTags(
  items: Array<{ id: string; elements: readonly unknown[] }>,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  await ensureAIConfigLoaded();
  if (!isAIConfigured()) {
    throw new Error(
      "请先在首页（文件列表）打开「AI 设置」，配置 Base URL 与 API Key。",
    );
  }
  const results = new Map<string, string>();
  const errors: string[] = [];
  let done = 0;

  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      if (signal?.aborted) {
        break;
      }
      const item = queue.shift();
      if (!item) {
        break;
      }
      try {
        const dataUrl = await elementsToPngDataUrl(item.elements);
        if (signal?.aborted) {
          break;
        }
        const tag = await openAIIconTag({
          imageDataUrl: dataUrl,
          signal,
        });
        if (tag) {
          results.set(item.id, tag);
        } else {
          errors.push(`[${item.id.slice(0, 8)}] 模型返回空标签`);
        }
      } catch (err: unknown) {
        if (signal?.aborted) {
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${item.id.slice(0, 8)}] ${msg}`);
      }
      done++;
      onProgress?.(done, items.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (signal?.aborted) {
    return results;
  }

  if (results.size === 0 && errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return results;
}

export function mountLibraryAIActions(): () => void {
  registerLibraryAIActions({ generateIconTags });
  return () => {
    registerLibraryAIActions({
      generateIconTags: async () => new Map(),
    });
  };
}
