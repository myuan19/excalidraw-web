import { useEffect, useState } from "react";
import type { EditorAdapter, EditorMeta } from "@/types/editor";
import { createImperativeRootController } from "@/lib/imperativeReactRoot";
import { useSettingsStore } from "@/stores/settingsStore";
import { THUMBNAIL_SVG_COLORS } from "@/features/thumbnail/thumbnailTheme";
import { cn } from "@/lib/utils";

export const TEXT_EDITOR_META: EditorMeta = {
  id: "text",
  displayName: "Text",
  icon: "icon-[mdi--file-document-outline]",
  supportedFormats: [".txt", ".md"],
  homeLabel: "文本",
  homeTagline: "轻量文档",
  homeOrder: 2,
};

function normalizeText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "text" in raw) {
    return String((raw as { text?: unknown }).text ?? "");
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    return normalizeText((raw as { data?: unknown }).data);
  }
  return "";
}

function TextEditorHost({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const [text, setText] = useState(value);
  const theme = useSettingsStore((state) => state.theme);
  const effectiveTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <textarea
      className={cn(
        "h-full w-full resize-none border-0 p-xl font-mono text-sm outline-none",
        effectiveTheme === "dark" ? "bg-surface text-foreground" : "bg-white text-foreground",
      )}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value);
      }}
    />
  );
}

export function createTextEditor(): EditorAdapter {
  const reactRoot = createImperativeRootController();
  let container: HTMLElement | null = null;
  let text = "";
  let changeHandler: ((data: unknown) => void) | null = null;

  function render() {
    if (!container) return;
    reactRoot.render(container, (root) => root.render(
      <TextEditorHost
        value={text}
        onChange={(nextText) => {
          text = nextText;
          changeHandler?.({ kind: "text", containerVersion: 1, formatVersion: 1, data: { text } });
        }}
      />,
    ));
  }

  return {
    ...TEXT_EDITOR_META,

    mount(el) {
      if (container !== el) {
        reactRoot.destroySync();
      }
      container = el;
      render();
    },

    unmount() {
      reactRoot.destroy();
      container = null;
      changeHandler = null;
    },

    unmountSync() {
      reactRoot.destroySync();
      container = null;
      changeHandler = null;
    },

    async loadData(raw) {
      const payload = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      try {
        text = normalizeText(JSON.parse(payload));
      } catch {
        text = payload;
      }
      render();
    },

    async saveData() {
      return {
        data: new Blob([
          JSON.stringify({ kind: "text", containerVersion: 1, formatVersion: 1, data: { text } }),
        ], { type: "application/json" }),
        format: ".txt",
      };
    },

    async getThumbnail() {
      const preview = text.split("\n").slice(0, 8).join("\n").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
      return new Blob([
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="384"><rect width="640" height="384" rx="28" fill="${THUMBNAIL_SVG_COLORS.canvas}"/><foreignObject x="32" y="32" width="576" height="320"><pre xmlns="http://www.w3.org/1999/xhtml" style="font:18px monospace;color:${THUMBNAIL_SVG_COLORS.label};white-space:pre-wrap">${preview}</pre></foreignObject></svg>`,
      ], { type: "image/svg+xml" });
    },

    onDidChange(handler) {
      changeHandler = handler;
      return () => {
        if (changeHandler === handler) changeHandler = null;
      };
    },
  };
}
