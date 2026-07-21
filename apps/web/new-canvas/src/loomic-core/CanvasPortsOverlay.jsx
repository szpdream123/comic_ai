import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasWorkflowNode } from "./canvas-workflow-edges.js";
import {
  canvasPortScreenPosition,
  canvasWorkflowConnectionMessage,
  createCanvasWorkflowConnection,
  disconnectCanvasWorkflowConnection,
  findCanvasWorkflowIncomingConnection,
  isCanvasConnectionShortcut,
  reconnectCanvasWorkflowConnection,
} from "./canvas-ports.js";
import { useCanvasGenerationConfig } from "./CanvasGenerationConfigContext.jsx";
import { resolveCanvasGenerationModels } from "./canvas-generation-models.js";
import {
  getWorkflowNodeDefinition,
  isWorkflowNodeElement,
  workflowNodeAvailabilityLabel,
} from "./workflow-node-elements.js";

const NODE_LABELS = {
  script: "文本",
  upload: "图片",
  image: "图片生成",
  video: "视频",
  audio: "音频",
  director: "导演台",
  output: "视频合成",
};

function readScene(excalidrawApi) {
  return {
    elements: excalidrawApi?.getSceneElements?.() ?? [],
    appState: excalidrawApi?.getAppState?.() ?? {},
  };
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches("input, textarea, select, [role='textbox']")
  );
}

function portLabel(element, node, direction, port) {
  const title = String(element.customData?.title ?? element.customData?.prompt ?? "").trim()
    || NODE_LABELS[node.type]
    || "节点";
  const action = direction === "input" ? "输入" : "输出";
  return `${title}：${port.kind} ${action}端口`;
}

function nodeScreenBounds(element, appState) {
  const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
  return {
    left: ((Number(element.x) || 0) + (Number(appState.scrollX) || 0)) * zoom,
    top: ((Number(element.y) || 0) + (Number(appState.scrollY) || 0)) * zoom,
    width: Math.max(0, (Number(element.width) || 0) * zoom),
    height: Math.max(0, (Number(element.height) || 0) * zoom),
  };
}

export function CanvasPortsOverlay({ excalidrawApi, connectionModeActive = false, onConnectionModeChange }) {
  const generationConfig = useCanvasGenerationConfig();
  const audioReady = useMemo(
    () => resolveCanvasGenerationModels(generationConfig.config, "audio").length > 0,
    [generationConfig.config],
  );
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [scene, setScene] = useState(() => readScene(excalidrawApi));
  const [selectedOutput, setSelectedOutput] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [notice, setNotice] = useState({ kind: "", text: "" });

  useEffect(() => {
    if (!excalidrawApi) return undefined;
    setScene(readScene(excalidrawApi));
    const unsubscribe = excalidrawApi.onChange?.((elements, appState) => {
      setScene({ elements, appState });
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [excalidrawApi]);

  const workflowNodes = useMemo(() => scene.elements.flatMap((element) => {
    if (element?.type === "arrow" || element?.isDeleted || element?.customData?.loomicHidden === true) return [];
    const node = canvasWorkflowNode(element);
    if (!node || (!node.ports.inputs.length && !node.ports.outputs.length)) return [];
    return [{ element, node }];
  }), [scene.elements]);

  useEffect(() => {
    if (!selectedOutput) return;
    const source = workflowNodes.find(({ node }) => node.id === selectedOutput.nodeId);
    if (!source?.node.ports.outputs.some((port) => port.id === selectedOutput.portId)) {
      setSelectedOutput(null);
      onConnectionModeChange?.(false);
    }
  }, [onConnectionModeChange, selectedOutput, workflowNodes]);

  const activateSelectedOutput = useCallback(() => {
    const selectedIds = scene.appState.selectedElementIds ?? {};
    const selectedNodes = workflowNodes.filter(({ node }) => selectedIds[node.id]);
    const source = selectedNodes.length === 1 ? selectedNodes[0] : null;
    const port = source?.node.ports.outputs[0];
    if (!source || !port) {
      setNotice({ kind: "error", text: "请先选择一个有输出端口的节点。" });
      onConnectionModeChange?.(false);
      return false;
    }
    setSelectedOutput({ nodeId: source.node.id, portId: port.id, kind: port.kind });
    setNotice({ kind: "status", text: "已进入连线模式，请点击目标输入端口。" });
    onConnectionModeChange?.(true);
    return true;
  }, [onConnectionModeChange, scene.appState.selectedElementIds, workflowNodes]);

  useEffect(() => {
    if (!connectionModeActive) {
      if (selectedOutput) setSelectedOutput(null);
      if (dragRef.current) {
        dragRef.current = null;
        setDragPreview(null);
      }
      return;
    }
    if (!selectedOutput && !dragRef.current) activateSelectedOutput();
  }, [activateSelectedOutput, connectionModeActive, selectedOutput]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && (selectedOutput || dragRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        dragRef.current = null;
        setDragPreview(null);
        setSelectedOutput(null);
        onConnectionModeChange?.(false);
        setNotice({ kind: "status", text: "已取消节点连接。" });
        return;
      }
      const inCanvas = document.querySelector(".loomic-canvas-root")?.contains(event.target);
      if (event.isComposing || event.repeat || !inCanvas || isTypingTarget(event.target) || !isCanvasConnectionShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      activateSelectedOutput();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activateSelectedOutput, onConnectionModeChange, selectedOutput]);

  const reject = useCallback((reason) => {
    setNotice({ kind: "error", text: canvasWorkflowConnectionMessage(reason) });
  }, []);

  const applyConnectionResult = useCallback((result, successText) => {
    if (!result.ok) {
      reject(result.reason);
      return false;
    }
    excalidrawApi.updateScene({
      elements: result.elements,
      appState: { selectedElementIds: result.arrow ? { [result.arrow.id]: true } : {} },
      captureUpdate: "IMMEDIATELY",
    });
    setSelectedOutput(null);
    onConnectionModeChange?.(false);
    setNotice({ kind: "status", text: successText });
    return true;
  }, [excalidrawApi, onConnectionModeChange, reject]);

  const handlePortClick = useCallback((element, node, direction, port) => {
    if (direction === "output") {
      if (selectedOutput) {
        reject("canvas_workflow_edge_direction_invalid");
        return;
      }
      setSelectedOutput({ nodeId: node.id, portId: port.id, kind: port.kind });
      onConnectionModeChange?.(true);
      setNotice({ kind: "status", text: "已选择输出端口，请点击目标输入端口。" });
      return;
    }
    if (!selectedOutput) {
      reject("canvas_workflow_edge_binding_required");
      return;
    }

    const currentElements = excalidrawApi.getSceneElements?.() ?? scene.elements;
    const result = createCanvasWorkflowConnection(currentElements, selectedOutput.nodeId, node.id);
    applyConnectionResult(result, "节点连接已创建。");
  }, [applyConnectionResult, excalidrawApi, onConnectionModeChange, reject, scene.elements, selectedOutput]);

  const beginPortDrag = useCallback((event, element, node, direction, port) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    let source = direction === "output"
      ? { nodeId: node.id, portId: port.id, kind: port.kind }
      : null;
    let reconnectArrowId = null;
    if (direction === "input" && !selectedOutput) {
      const incoming = findCanvasWorkflowIncomingConnection(scene.elements, node.id);
      const sourceElement = incoming && scene.elements.find((candidate) => candidate.id === incoming.startBinding?.elementId);
      const sourceNode = sourceElement && canvasWorkflowNode(sourceElement);
      const sourcePort = sourceNode?.ports.outputs[0];
      if (incoming && sourcePort) {
        source = { nodeId: sourceNode.id, portId: sourcePort.id, kind: sourcePort.kind };
        reconnectArrowId = incoming.id;
      }
    }
    if (!source) return;
    const sourceElement = scene.elements.find((candidate) => candidate.id === source.nodeId);
    if (!sourceElement) return;
    const start = canvasPortScreenPosition(sourceElement, "output", scene.appState);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      source,
      reconnectArrowId,
      start,
    };
    onConnectionModeChange?.(true);
    setDragPreview({ source, reconnectArrowId, start, point: start, moved: false });
  }, [onConnectionModeChange, scene.appState, scene.elements, selectedOutput]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const moved = drag.moved || Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4;
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      if (!drag.moved) setSelectedOutput(null);
      drag.moved = true;
      const bounds = overlayRef.current?.getBoundingClientRect();
      const point = {
        x: event.clientX - (bounds?.left ?? 0),
        y: event.clientY - (bounds?.top ?? 0),
      };
      setDragPreview({ source: drag.source, reconnectArrowId: drag.reconnectArrowId, start: drag.start, point, moved: true });
    };
    const finishPointerDrag = (event, cancelled = false) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragPreview(null);
      if (!drag.moved || cancelled) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".loomic-canvas-port.is-input");
      const currentElements = excalidrawApi.getSceneElements?.() ?? scene.elements;
      if (target?.dataset.nodeId) {
        const result = drag.reconnectArrowId
          ? reconnectCanvasWorkflowConnection(currentElements, drag.reconnectArrowId, target.dataset.nodeId)
          : createCanvasWorkflowConnection(currentElements, drag.source.nodeId, target.dataset.nodeId);
        applyConnectionResult(result, drag.reconnectArrowId ? "节点连接已重新连接。" : "节点连接已创建。");
        return;
      }
      if (drag.reconnectArrowId) {
        applyConnectionResult(
          disconnectCanvasWorkflowConnection(currentElements, drag.reconnectArrowId),
          "节点连接已断开。",
        );
        return;
      }
      onConnectionModeChange?.(false);
      setNotice({ kind: "status", text: "已取消拖拽连线。" });
    };
    const handlePointerUp = (event) => finishPointerDrag(event, false);
    const handlePointerCancel = (event) => finishPointerDrag(event, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
    };
  }, [applyConnectionResult, excalidrawApi, onConnectionModeChange, scene.elements]);

  const activeOutput = dragPreview?.source ?? selectedOutput;
  const previewPath = dragPreview?.moved
    ? `M ${dragPreview.start.x} ${dragPreview.start.y} C ${(dragPreview.start.x + dragPreview.point.x) / 2} ${dragPreview.start.y}, ${(dragPreview.start.x + dragPreview.point.x) / 2} ${dragPreview.point.y}, ${dragPreview.point.x} ${dragPreview.point.y}`
    : "";

  return (
    <div className="loomic-canvas-ports" aria-label="节点连接端口" ref={overlayRef}>
      {previewPath ? (
        <svg className="loomic-port-drag-preview" aria-hidden="true">
          <path d={previewPath} />
        </svg>
      ) : null}
      {workflowNodes.map(({ element }) => {
        if (!isWorkflowNodeElement(element)) return null;
        const definition = getWorkflowNodeDefinition(element);
        const data = element.customData ?? {};
        const preview = String(data[definition.textField] ?? "").trim() || definition.description;
        return (
          <div
            className="loomic-workflow-node-label"
            data-compact={(scene.appState.zoom?.value ?? 1) < 0.55 ? "true" : "false"}
            key={`${element.id}:workflow-label`}
            style={nodeScreenBounds(element, scene.appState)}
          >
            <header><strong>{data.title || definition.title}</strong><span>{workflowNodeAvailabilityLabel(element, { audioReady })}</span></header>
            <p>{preview}</p>
            <small>{definition.description}</small>
          </div>
        );
      })}
      {workflowNodes.flatMap(({ element, node }) => [
        ...node.ports.inputs.map((port) => {
          const position = canvasPortScreenPosition(element, "input", scene.appState);
          const compatible = !activeOutput || port.accepts?.includes(activeOutput.kind) || port.kind === "any" || port.kind === activeOutput.kind;
          const incoming = findCanvasWorkflowIncomingConnection(scene.elements, node.id);
          return (
            <button
              key={`${node.id}:input:${port.id}`}
              type="button"
              className={`loomic-canvas-port is-input ${activeOutput ? (compatible ? "is-compatible" : "is-incompatible") : ""} ${incoming ? "is-connected" : ""}`}
              style={{ left: position.x, top: position.y }}
              data-port-kind={port.kind}
              data-node-id={node.id}
              data-port-id={port.id}
              aria-label={portLabel(element, node, "input", port)}
              title={portLabel(element, node, "input", port)}
              onPointerDown={(event) => beginPortDrag(event, element, node, "input", port)}
              onClick={() => {
                if (!suppressClickRef.current) handlePortClick(element, node, "input", port);
              }}
            />
          );
        }),
        ...node.ports.outputs.map((port) => {
          const position = canvasPortScreenPosition(element, "output", scene.appState);
          const selected = selectedOutput?.nodeId === node.id && selectedOutput?.portId === port.id;
          return (
            <button
              key={`${node.id}:output:${port.id}`}
              type="button"
              className={`loomic-canvas-port is-output ${selected ? "is-selected" : ""}`}
              style={{ left: position.x, top: position.y }}
              data-port-kind={port.kind}
              data-node-id={node.id}
              data-port-id={port.id}
              aria-label={portLabel(element, node, "output", port)}
              aria-pressed={selected}
              title={portLabel(element, node, "output", port)}
              onPointerDown={(event) => beginPortDrag(event, element, node, "output", port)}
              onClick={() => {
                if (!suppressClickRef.current) handlePortClick(element, node, "output", port);
              }}
            />
          );
        }),
      ])}
      {notice.text ? (
        <div
          className={`loomic-port-notice ${notice.kind === "error" ? "is-error" : ""}`}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}
