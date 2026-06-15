import React, { createContext, useContext, useMemo, useState } from "react";

export const CaptureUpdateAction = {
  IMMEDIATELY: "IMMEDIATELY",
  EVENTUALLY: "EVENTUALLY",
  NEVER: "NEVER",
} as const;

export const THEME = {
  LIGHT: "light",
  DARK: "dark",
} as const;

export const MIME_TYPES = {
  excalidraw: "application/vnd.excalidraw+json",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
} as const;

export const defaultLang = { code: "zh-CN", label: "中文" };
export const languages = [defaultLang];

const ExcalidrawAPIContext = createContext<any>(null);

export function ExcalidrawAPIProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [api] = useState(null);
  return (
    <ExcalidrawAPIContext.Provider value={api}>
      {children}
    </ExcalidrawAPIContext.Provider>
  );
}

export function useExcalidrawAPI() {
  return useContext(ExcalidrawAPIContext);
}

export function Excalidraw(props: Record<string, unknown>) {
  const api = useMemo(
    () => ({
      getSceneElements: () => [],
      getAppState: () => ({}),
      updateScene: () => {},
      scrollToContent: () => {},
    }),
    [],
  );
  (props.onExcalidrawAPI as ((api: unknown) => void) | undefined)?.(api);
  return <div className="excalidraw" style={{ height: "100%" }} />;
}

export function Stats(_props: Record<string, unknown>) {
  return null;
}

export function DefaultSidebar(_props: Record<string, unknown>) {
  return null;
}

export function DiagramToCodePlugin(_props: Record<string, unknown>) {
  return null;
}

export function TTDDialog(_props: Record<string, unknown>) {
  return null;
}

export async function exportToBlob() {
  return new Blob([], { type: "application/octet-stream" });
}

export async function exportToSvg() {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

export function getTextFromElements() {
  return "";
}

export function zoomToFitBounds({ appState }: { appState: unknown }) {
  return { appState };
}
