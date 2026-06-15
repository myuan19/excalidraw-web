export type EmbedDocumentKind = "excalidraw" | "mindmap";

export type EmbedBootstrap = {
  fileId?: string;
  fileName?: string;
  kind?: EmbedDocumentKind;
  token?: string;
  dataUrl?: string;
};

declare global {
  interface Window {
    __EXCALIDRAW_EMBED_MODE__?: boolean;
    __EXCALIDRAW_EMBED_BOOTSTRAP__?: EmbedBootstrap;
    __EXCALIDRAW_EMBED_FILE_ID__?: string;
    __EXCALIDRAW_EMBED_FILE_NAME__?: string;
    __EXCALIDRAW_EMBED_KIND__?: string;
    __EXCALIDRAW_EMBED_DATA__?: unknown;
  }
}

export function isEmbedMode(): boolean {
  return !!(
    window.__EXCALIDRAW_EMBED_MODE__ ||
    window.__EXCALIDRAW_EMBED_BOOTSTRAP__
  );
}

export function getEmbedBootstrap(): EmbedBootstrap {
  const legacyKind =
    window.__EXCALIDRAW_EMBED_KIND__ === "mindmap" ? "mindmap" : "excalidraw";
  return {
    fileId:
      window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.fileId ??
      window.__EXCALIDRAW_EMBED_FILE_ID__,
    fileName:
      window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.fileName ??
      window.__EXCALIDRAW_EMBED_FILE_NAME__,
    kind: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.kind ?? legacyKind,
    token: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.token,
    dataUrl: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.dataUrl,
  };
}
