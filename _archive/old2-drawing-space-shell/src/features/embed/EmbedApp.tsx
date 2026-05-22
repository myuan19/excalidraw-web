import { Excalidraw } from "@excalidraw/excalidraw";
import { normalizeExcalidrawScene } from "@/editors/excalidraw/save";
import {
  HOST_SOURCE,
  isNativeMindMapMessage,
  normalizeMindMapData,
  toBridgePayload,
} from "@/editors/mindmap/bridge";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EmbedDataResponse } from "@/types/file";
import { buildFileDeepLink } from "@/features/routing/fileDeepLink";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    __EXCALIDRAW_WEB_EMBED__?: {
      mode: "embed";
      fileId: string;
      token: string;
      payload: EmbedDataResponse;
    };
  }
}

function buildEditUrl(fileId: string, kind: string) {
  return buildFileDeepLink(fileId, kind);
}

function EmbedChrome({
  name,
  fileId,
  kind,
  locked,
  onToggleLocked,
}: {
  name: string;
  fileId: string;
  kind: string;
  locked: boolean;
  onToggleLocked(): void;
}) {
  return (
    <div className="absolute left-md right-md top-md z-20 flex items-center gap-sm rounded-lg border border-border bg-surface/90 px-md py-sm text-sm shadow-sm backdrop-blur">
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <button
        type="button"
        className="rounded-md border border-border px-sm py-xs hover:bg-surface-muted"
        onClick={onToggleLocked}
      >
        {locked ? "解锁交互" : "锁定视图"}
      </button>
      <a
        className="rounded-md border border-border px-sm py-xs text-foreground no-underline hover:bg-surface-muted"
        href={buildEditUrl(fileId, kind)}
        target="_blank"
        rel="noreferrer"
      >
        打开编辑
      </a>
    </div>
  );
}

function LockedOverlay({ onUnlock }: { onUnlock(): void }) {
  return (
    <button
      type="button"
      className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-transparent"
      onClick={onUnlock}
      title="点击解锁嵌入内容交互"
    >
      <span className="rounded-full bg-surface/90 px-lg py-sm text-sm text-muted shadow-sm">
        点击解锁嵌入内容交互
      </span>
    </button>
  );
}

function MindMapReadonly({
  data,
  name,
  fileId,
  token,
}: {
  data: unknown;
  name: string;
  fileId: string;
  token: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [locked, setLocked] = useState(true);
  const mindMapData = useMemo(() => normalizeMindMapData(data), [data]);
  const iframeSrc = `/embed/mind-map/index.html?_t=${encodeURIComponent(token)}`;

  useEffect(() => {
    const postInit = () => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: HOST_SOURCE,
          type: "initMindMap",
          payload: {
            ...toBridgePayload(mindMapData),
            embedMode: true,
            readOnly: true,
          },
        },
        window.location.origin,
      );
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isNativeMindMapMessage(event.data)) {
        return;
      }
      if (event.data.type === "ready" || event.data.type === "appInited") {
        postInit();
      }
    };
    window.addEventListener("message", onMessage);
    postInit();
    return () => window.removeEventListener("message", onMessage);
  }, [mindMapData]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <EmbedChrome
        name={name}
        fileId={fileId}
        kind="mindmap"
        locked={locked}
        onToggleLocked={() => setLocked((value) => !value)}
      />
      {locked && <LockedOverlay onUnlock={() => setLocked(false)} />}
      <iframe
        ref={iframeRef}
        title={name}
        src={iframeSrc}
        className={cn(
          "embed-surface min-h-0 flex-1 border-0 bg-white",
          locked && "embed-surface--locked",
        )}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

export function EmbedApp() {
  const bootstrap = window.__EXCALIDRAW_WEB_EMBED__;
  if (!bootstrap) return null;

  const file = bootstrap.payload.file ?? {
    id: bootstrap.payload.id ?? bootstrap.fileId,
    name: bootstrap.payload.name ?? "Embed",
    kind: bootstrap.payload.kind ?? "excalidraw",
  };

  if (file.kind === "mindmap") {
    return (
      <MindMapReadonly
        data={bootstrap.payload.data}
        name={file.name}
        fileId={file.id}
        token={bootstrap.token}
      />
    );
  }

  return (
    <ExcalidrawReadonly
      data={bootstrap.payload.data}
      name={file.name}
      fileId={file.id}
    />
  );
}

function ExcalidrawReadonly({
  data,
  name,
  fileId,
}: {
  data: unknown;
  name: string;
  fileId: string;
}) {
  const scene = normalizeExcalidrawScene(data);
  const [locked, setLocked] = useState(true);
  return (
    <div className="relative h-screen bg-background">
      <EmbedChrome
        name={name}
        fileId={fileId}
        kind="excalidraw"
        locked={locked}
        onToggleLocked={() => setLocked((value) => !value)}
      />
      {locked && <LockedOverlay onUnlock={() => setLocked(false)} />}
      <div className={cn("embed-surface h-full w-full", locked && "embed-surface--locked")}>
      <Excalidraw
        initialData={scene as never}
        viewModeEnabled
        UIOptions={{ canvasActions: { loadScene: false, saveAsImage: false } }}
      />
      </div>
    </div>
  );
}
