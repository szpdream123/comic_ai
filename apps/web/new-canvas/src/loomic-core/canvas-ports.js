import { generateCanvasId } from "./canvas-elements.js";
import {
  canvasWorkflowNode,
  collectCanvasWorkflowEdges,
  validateCanvasWorkflowArrow,
} from "./canvas-workflow-edges.js";
import { matchesCanvasShortcut } from "./canvas-shortcuts.js";

const CONNECTION_MESSAGES = {
  canvas_workflow_edge_binding_required: "请选择一个输出端口，再连接到输入端口。",
  canvas_workflow_edge_self_connection: "节点不能连接到自身。",
  canvas_workflow_edge_endpoint_missing: "连接端点已不存在，请重新选择。",
  canvas_workflow_edge_direction_invalid: "只能从输出端口连接到输入端口。",
  canvas_workflow_edge_kind_mismatch: "这两个端口的数据类型不兼容。",
  canvas_workflow_edge_duplicate: "这两个端口已经连接。",
  canvas_workflow_edge_cycle: "该连接会形成循环，已取消连接。",
};

export function isCanvasConnectionShortcut(event = {}) {
  return matchesCanvasShortcut(event, "connect");
}

function randomInteger() {
  return Math.floor(Math.random() * 2_000_000_000);
}

function bindingFor(elementId, fixedPoint) {
  return { elementId, focus: 0, gap: 1, fixedPoint };
}

function addBoundArrow(element, arrowId) {
  const current = Array.isArray(element.boundElements) ? element.boundElements : [];
  if (current.some((binding) => binding?.id === arrowId)) return element;
  return {
    ...element,
    boundElements: [...current, { id: arrowId, type: "arrow" }],
    version: (element.version ?? 1) + 1,
    versionNonce: randomInteger(),
    updated: Date.now(),
  };
}

function removeBoundArrow(element, arrowId) {
  const current = Array.isArray(element?.boundElements) ? element.boundElements : [];
  if (!current.some((binding) => binding?.id === arrowId)) return element;
  return {
    ...element,
    boundElements: current.filter((binding) => binding?.id !== arrowId),
    version: (element.version ?? 1) + 1,
    versionNonce: randomInteger(),
    updated: Date.now(),
  };
}

function removeBoundArrowGroup(element, arrowIds) {
  if (arrowIds.size === 1) return removeBoundArrow(element, [...arrowIds][0]);
  const current = Array.isArray(element?.boundElements) ? element.boundElements : [];
  if (!current.some((binding) => arrowIds.has(binding?.id))) return element;
  return {
    ...element,
    boundElements: current.filter((binding) => !arrowIds.has(binding?.id)),
    version: (element.version ?? 1) + 1,
    versionNonce: randomInteger(),
    updated: Date.now(),
  };
}

export function canvasWorkflowConnectionMessage(reason) {
  return CONNECTION_MESSAGES[reason] ?? "无法创建该节点连接。";
}

export function canvasPortScenePosition(element, direction) {
  const width = Number(element?.width) || 0;
  const height = Number(element?.height) || 0;
  const centerX = (Number(element?.x) || 0) + width / 2;
  const centerY = (Number(element?.y) || 0) + height / 2;
  const sideX = direction === "input" ? centerX - width / 2 : centerX + width / 2;
  const angle = Number(element?.angle) || 0;
  const relativeX = sideX - centerX;
  return {
    x: centerX + relativeX * Math.cos(angle),
    y: centerY + relativeX * Math.sin(angle),
  };
}

export function canvasPortScreenPosition(element, direction, appState = {}) {
  const scenePoint = canvasPortScenePosition(element, direction);
  const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
  return {
    x: (scenePoint.x + (Number(appState.scrollX) || 0)) * zoom,
    y: (scenePoint.y + (Number(appState.scrollY) || 0)) * zoom,
  };
}

export function createCanvasWorkflowConnection(elements, sourceNodeId, targetNodeId, options = {}) {
  const sceneElements = Array.isArray(elements) ? elements : [];
  const liveElements = sceneElements.filter((element) => !element?.isDeleted);
  const nodeById = new Map();
  for (const element of liveElements) {
    if (element?.type === "arrow") continue;
    const node = canvasWorkflowNode(element);
    if (node && !nodeById.has(node.id)) nodeById.set(node.id, node);
  }

  const sourceElement = liveElements.find((element) => element?.id === sourceNodeId);
  const targetElement = liveElements.find((element) => element?.id === targetNodeId);
  const sourcePoint = canvasPortScenePosition(sourceElement, "output");
  const targetPoint = canvasPortScenePosition(targetElement, "input");
  const arrowId = options.arrowId ?? generateCanvasId();
  const now = Date.now();
  const arrow = {
    type: "arrow",
    id: arrowId,
    x: sourcePoint.x,
    y: sourcePoint.y,
    width: Math.abs(targetPoint.x - sourcePoint.x),
    height: Math.abs(targetPoint.y - sourcePoint.y),
    angle: 0,
    strokeColor: options.strokeColor ?? "#9eb52f",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: { type: 2 },
    boundElements: null,
    frameId: null,
    index: null,
    seed: randomInteger(),
    version: 1,
    versionNonce: randomInteger(),
    isDeleted: false,
    updated: now,
    link: null,
    locked: false,
    points: [[0, 0], [targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y]],
    lastCommittedPoint: null,
    startBinding: bindingFor(sourceNodeId, [1, 0.5]),
    endBinding: bindingFor(targetNodeId, [0, 0.5]),
    startArrowhead: null,
    endArrowhead: "arrow",
    customData: { workflowEdge: true },
  };

  const validation = validateCanvasWorkflowArrow(
    arrow,
    nodeById,
    collectCanvasWorkflowEdges(liveElements),
  );
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      message: canvasWorkflowConnectionMessage(validation.reason),
      elements: sceneElements,
    };
  }

  const nextElements = sceneElements.map((element) => {
    if (element.id !== sourceNodeId && element.id !== targetNodeId) return element;
    return addBoundArrow(element, arrowId);
  });
  return { ok: true, arrow, edge: validation.edge, elements: [...nextElements, arrow] };
}

function validCanvasWorkflowArrowIds(elements, targetNodeId = "") {
  const targetId = String(targetNodeId ?? "").trim();
  return new Set(collectCanvasWorkflowEdges(elements)
    .filter((edge) => !targetId || edge.targetNodeId === targetId)
    .map((edge) => edge.id));
}

function isValidCanvasWorkflowArrow(validEdgeIds, element) {
  return element?.type === "arrow"
    && !element.isDeleted
    && validEdgeIds.has(`${element.id}:workflow-edge`);
}

function duplicateCanvasWorkflowArrowIds(elements, connection) {
  const sourceNodeId = String(connection?.startBinding?.elementId ?? "").trim();
  const targetNodeId = String(connection?.endBinding?.elementId ?? "").trim();
  return new Set((Array.isArray(elements) ? elements : []).filter((element) => {
    if (element?.type !== "arrow" || element.isDeleted) return false;
    const customData = element.customData && typeof element.customData === "object" ? element.customData : {};
    if (Object.prototype.hasOwnProperty.call(customData, "workflowEdge") && customData.workflowEdge !== true) return false;
    return String(element.startBinding?.elementId ?? "").trim() === sourceNodeId
      && String(element.endBinding?.elementId ?? "").trim() === targetNodeId;
  }).map((element) => element.id));
}

export function findCanvasWorkflowIncomingConnection(elements, targetNodeId) {
  const targetId = String(targetNodeId ?? "").trim();
  if (!targetId) return null;
  const sceneElements = Array.isArray(elements) ? elements : [];
  const validEdgeIds = validCanvasWorkflowArrowIds(sceneElements, targetId);
  return [...sceneElements].reverse().find((element) => isValidCanvasWorkflowArrow(validEdgeIds, element)) ?? null;
}

export function disconnectCanvasWorkflowConnection(elements, arrowId) {
  const sceneElements = Array.isArray(elements) ? elements : [];
  const validEdgeIds = validCanvasWorkflowArrowIds(sceneElements);
  const connection = sceneElements.find((element) => (
    element?.id === arrowId
    && isValidCanvasWorkflowArrow(validEdgeIds, element)
  ));
  if (!connection) {
    return { ok: false, reason: "canvas_workflow_edge_endpoint_missing", elements: sceneElements };
  }
  const duplicateArrowIds = duplicateCanvasWorkflowArrowIds(sceneElements, connection);
  const now = Date.now();
  const nextElements = sceneElements.map((element) => {
    if (duplicateArrowIds.has(element.id)) {
      return {
        ...element,
        isDeleted: true,
        version: (element.version ?? 1) + 1,
        versionNonce: randomInteger(),
        updated: now,
      };
    }
    return removeBoundArrowGroup(element, duplicateArrowIds);
  });
  return { ok: true, connection, disconnectedArrowIds: [...duplicateArrowIds], elements: nextElements };
}

export function reconnectCanvasWorkflowConnection(elements, arrowId, targetNodeId) {
  const sceneElements = Array.isArray(elements) ? elements : [];
  const validEdgeIds = validCanvasWorkflowArrowIds(sceneElements);
  const connection = sceneElements.find((element) => (
    element?.id === arrowId
    && isValidCanvasWorkflowArrow(validEdgeIds, element)
  ));
  const sourceNodeId = String(connection?.startBinding?.elementId ?? "").trim();
  if (!connection || !sourceNodeId) {
    return { ok: false, reason: "canvas_workflow_edge_endpoint_missing", elements: sceneElements };
  }
  const duplicateArrowIds = duplicateCanvasWorkflowArrowIds(sceneElements, connection);

  const detachedElements = sceneElements
    .filter((element) => !duplicateArrowIds.has(element.id))
    .map((element) => removeBoundArrowGroup(element, duplicateArrowIds));
  const result = createCanvasWorkflowConnection(detachedElements, sourceNodeId, targetNodeId, {
    arrowId,
    strokeColor: connection.strokeColor,
  });
  if (!result.ok) return { ...result, elements: sceneElements };

  const replacement = {
    ...result.arrow,
    opacity: connection.opacity ?? result.arrow.opacity,
    strokeWidth: connection.strokeWidth ?? result.arrow.strokeWidth,
    strokeStyle: connection.strokeStyle ?? result.arrow.strokeStyle,
    customData: { ...connection.customData, workflowEdge: true },
    seed: connection.seed ?? result.arrow.seed,
    version: (connection.version ?? 1) + 1,
    versionNonce: randomInteger(),
  };
  return {
    ...result,
    arrow: replacement,
    elements: result.elements.map((element) => element.id === arrowId ? replacement : element),
  };
}
