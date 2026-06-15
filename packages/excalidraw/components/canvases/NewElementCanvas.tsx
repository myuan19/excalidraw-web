import React, { useEffect, useRef } from "react";

import { renderNewElementScene } from "../../renderer/renderNewElementScene";

import type { NewElementSceneRenderConfig } from "../../scene/types";

type NewElementCanvasProps = Omit<NewElementSceneRenderConfig, "canvas" | "newElement">;

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

export default function NewElementCanvas(props: NewElementCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    resizeCanvas(
      canvasRef.current,
      props.appState.width,
      props.appState.height,
      props.scale,
    );
    renderNewElementScene({
      canvas: canvasRef.current,
      rc: props.rc,
      newElement: props.appState.newElement,
      elementsMap: props.elementsMap,
      allElementsMap: props.allElementsMap,
      scale: props.scale,
      appState: props.appState,
      renderConfig: props.renderConfig,
    });
  });

  return (
    <canvas
      ref={canvasRef}
      className="excalidraw__canvas new-element"
      aria-hidden="true"
    />
  );
}
