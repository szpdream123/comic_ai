import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasScrollForSceneCenter, createCanvasMinimapModel, minimapPointToScene } from "./canvas-minimap.js";

const MAP_WIDTH = 184;
const MAP_HEIGHT = 116;

function nodeClassName(type) {
  if (type === "image" || type === "image-generator") return "is-image";
  if (type === "video-generator" || type === "embeddable") return "is-video";
  if (type === "text" || type === "text-node") return "is-text";
  return "is-shape";
}

export function CanvasMinimap({ excalidrawApi }) {
  const frameRef = useRef(null);
  const activePointerRef = useRef(null);
  const navigationModelRef = useRef(null);
  const animationRef = useRef(null);
  const [snapshot, setSnapshot] = useState(() => ({
    elements: excalidrawApi?.getSceneElements?.() ?? [],
    appState: excalidrawApi?.getAppState?.() ?? {},
  }));

  useEffect(() => {
    if (!excalidrawApi) return undefined;
    const sync = (elements, appState) => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(() => {
        setSnapshot({
          elements: elements ?? excalidrawApi.getSceneElements(),
          appState: appState ?? excalidrawApi.getAppState(),
        });
      });
    };
    sync();
    const unsubscribeChange = excalidrawApi.onChange((elements, appState) => sync(elements, appState));
    const unsubscribeScroll = excalidrawApi.onScrollChange(() => sync());
    const syncOnResize = () => sync();
    window.addEventListener("resize", syncOnResize);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (typeof unsubscribeChange === "function") unsubscribeChange();
      if (typeof unsubscribeScroll === "function") unsubscribeScroll();
      window.removeEventListener("resize", syncOnResize);
    };
  }, [excalidrawApi]);

  const model = useMemo(() => createCanvasMinimapModel(snapshot.elements, snapshot.appState, {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
  }), [snapshot]);

  const navigate = useCallback((clientX, clientY) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return;
    const mapX = (clientX - bounds.left) * MAP_WIDTH / bounds.width;
    const mapY = (clientY - bounds.top) * MAP_HEIGHT / bounds.height;
    const point = minimapPointToScene(navigationModelRef.current ?? model, mapX, mapY);
    const appState = excalidrawApi.getAppState();
    excalidrawApi.updateScene({ appState: canvasScrollForSceneCenter(appState, point), captureUpdate: "NONE" });
  }, [excalidrawApi, model]);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    activePointerRef.current = event.pointerId;
    navigationModelRef.current = model;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    navigate(event.clientX, event.clientY);
  }, [model, navigate]);
  const handlePointerMove = useCallback((event) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    navigate(event.clientX, event.clientY);
  }, [navigate]);
  const handlePointerEnd = useCallback((event) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    navigationModelRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  return (
    <div className="loomic-minimap" data-node-count={model.nodes.length} onPointerDown={(event) => event.stopPropagation()}>
      <svg
        ref={frameRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="application"
        aria-label="画布小地图，点击或拖动以导航"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      >
        {model.nodes.map((node) => <rect key={node.id} className={`loomic-minimap-node ${nodeClassName(node.type)}`} {...node.rect} rx="1.5" />)}
        <rect className="loomic-minimap-viewport" {...model.viewport} rx="2" />
      </svg>
    </div>
  );
}
