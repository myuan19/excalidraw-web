import type { EditorAdapter, EditorMeta } from "@/types/editor";
import { CANVAS_THEME_RGB } from "@/styles/canvasTheme";

export const TEST_EDITOR_META: EditorMeta = {
  id: "test",
  displayName: "测试编辑器",
  icon: "icon-[mdi--pencil-ruler]",
  supportedFormats: [".test"],
  showOnHome: false,
};

export function createTestEditor(): EditorAdapter {
  let container: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let content = "Hello, Test Editor!";
  let animFrame = 0;

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = CANVAS_THEME_RGB.background;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = CANVAS_THEME_RGB.border;
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let x = 0; x <= w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.fillStyle = CANVAS_THEME_RGB.foreground;
    ctx.font = "bold 24px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(content, w / 2, h / 2 - 20);

    ctx.fillStyle = CANVAS_THEME_RGB.muted;
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText("这是测试编辑器 - 用于验证基座功能", w / 2, h / 2 + 20);

    const t = Date.now() / 1000;
    ctx.strokeStyle = CANVAS_THEME_RGB.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 70, 20, 0, ((t % 4) / 4) * Math.PI * 2);
    ctx.stroke();
  }

  function loop() {
    render();
    animFrame = requestAnimationFrame(loop);
  }

  function handleResize() {
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
  }

  const resizeObserver = new ResizeObserver(handleResize);

  return {
    ...TEST_EDITOR_META,

    mount(el: HTMLElement) {
      container = el;
      canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      container.appendChild(canvas);
      handleResize();
      resizeObserver.observe(container);
      loop();
    },

    unmount() {
      cancelAnimationFrame(animFrame);
      if (container) resizeObserver.unobserve(container);
      if (canvas && container) container.removeChild(canvas);
      canvas = null;
      container = null;
    },

    resize() {
      handleResize();
    },

    async loadData(raw: ArrayBuffer | string) {
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          content = parsed.content ?? raw;
        } catch {
          content = raw;
        }
      } else {
        content = new TextDecoder().decode(raw);
      }
      render();
    },

    async saveData() {
      const json = JSON.stringify({ content, savedAt: Date.now() });
      return { data: new Blob([json], { type: "application/json" }), format: ".test" };
    },

    async getThumbnail(width: number, height: number) {
      const offscreen = document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext("2d")!;
      ctx.fillStyle = CANVAS_THEME_RGB.background;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = CANVAS_THEME_RGB.foreground;
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(content.slice(0, 20), width / 2, height / 2);
      return new Promise<Blob>((resolve) => {
        offscreen.toBlob((blob) => resolve(blob!), "image/png");
      });
    },
  };
}
