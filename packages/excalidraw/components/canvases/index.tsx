import React, { useEffect, useRef } from "react";

import { renderInteractiveScene } from "../../renderer/interactiveScene";
import { renderStaticScene } from "../../renderer/staticScene";

import type {
  InteractiveSceneRenderAnimationState,
  InteractiveSceneRenderConfig,
  StaticSceneRenderConfig,
} from "../../scene/types";

type StaticCanvasProps = StaticSceneRenderConfig & {
  sceneNonce?: number;
  selectionNonce?: number;
};

type InteractiveCanvasProps = Omit<
  InteractiveSceneRenderConfig,
  "canvas" | "renderConfig" | "callback" | "animationState" | "deltaTime"
> & {
  containerRef?: React.RefObject<HTMLDivElement | null>;
  canvas: HTMLCanvasElement | null;
  sceneNonce?: number;
  selectionNonce?: number;
  renderScrollbars?: boolean;
  renderInteractiveSceneCallback: InteractiveSceneRenderConfig["callback"];
  handleCanvasRef: (canvas: HTMLCanvasElement | null) => void;
  onContextMenu?: React.MouseEventHandler<HTMLCanvasElement>;
  onClick?: React.MouseEventHandler<HTMLCanvasElement>;
  onPointerMove?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerUp?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLCanvasElement>;
  onTouchMove?: React.TouchEventHandler<HTMLCanvasElement>;
  onPointerDown?: React.PointerEventHandler<HTMLCanvasElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLCanvasElement>;
};

function resizeCanvas(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  scale: number,
) {
  if (!canvas) {
    return;
  }
  const nextWidth = Math.max(1, Math.ceil(width * scale));
  const nextHeight = Math.max(1, Math.ceil(height * scale));
  if (canvas.width !== nextWidth) {
    canvas.width = nextWidth;
  }
  if (canvas.height !== nextHeight) {
    canvas.height = nextHeight;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

export function StaticCanvas(props: StaticCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    resizeCanvas(
      canvasRef.current,
      props.appState.width,
      props.appState.height,
      props.scale,
    );
    if (!canvasRef.current) {
      return;
    }
    renderStaticScene({
      canvas: canvasRef.current,
      rc: props.rc,
      elementsMap: props.elementsMap,
      allElementsMap: props.allElementsMap,
      visibleElements: props.visibleElements,
      scale: props.scale,
      appState: props.appState,
      renderConfig: props.renderConfig,
    });
  });

  return (
    <canvas
      ref={canvasRef}
      className="excalidraw__canvas static"
      aria-hidden="true"
    />
  );
}

export function InteractiveCanvas(props: InteractiveCanvasProps) {
  const animationState = useRef<
    InteractiveSceneRenderAnimationState | undefined
  >(undefined);
  const lastRenderTime = useRef(performance.now());

  useEffect(() => {
    resizeCanvas(
      props.canvas,
      props.appState.width,
      props.appState.height,
      props.scale,
    );
    const now = performance.now();
    const result = renderInteractiveScene({
      app: props.app,
      canvas: props.canvas,
      elementsMap: props.elementsMap,
      visibleElements: props.visibleElements,
      selectedElements: props.selectedElements,
      allElementsMap: props.allElementsMap,
      scale: props.scale,
      appState: props.appState,
      renderConfig: {
        remoteSelectedElementIds: new Map(),
        remotePointerViewportCoords: new Map(),
        remotePointerUserStates: new Map(),
        remotePointerUsernames: new Map(),
        remotePointerButton: new Map(),
        selectionColor: "#6965db",
        lastViewportPosition: props.app.lastViewportPosition,
        renderScrollbars: props.renderScrollbars,
      },
      editorInterface: props.editorInterface,
      callback: props.renderInteractiveSceneCallback,
      animationState: animationState.current,
      deltaTime: now - lastRenderTime.current,
    });
    animationState.current = result.animationState;
    lastRenderTime.current = now;
  });

  return (
    <canvas
      ref={props.handleCanvasRef}
      className="excalidraw__canvas interactive"
      onContextMenu={props.onContextMenu}
      onClick={props.onClick}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onTouchMove={props.onTouchMove}
      onPointerDown={props.onPointerDown}
      onDoubleClick={props.onDoubleClick}
    />
  );
}
