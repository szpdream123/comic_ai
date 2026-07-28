export function renderCanvasMinimap(ui = {}) {
  if (ui.canvasMinimapHidden === true) return "";
  const nodes = Array.isArray(ui.canvasDocument?.nodes) ? ui.canvasDocument.nodes : [];
  if (!nodes.length) return "";
  const bounds = minimapBounds(nodes);
  return `<aside class="new-canvas-minimap" data-canvas-minimap aria-label="画布小地图">
    <header><span>小地图</span><button type="button" data-minimap-action="fit" title="适配全部内容" aria-label="适配全部内容">⌗</button></header>
    <div class="new-canvas-minimap-stage" data-minimap-action="fit">
      ${nodes.map((node) => renderMinimapNode(node, bounds, node.id === ui.selectedCanvasNodeId)).join("")}
    </div>
  </aside>`;
}

export function createCanvasMinimapController({ surface, workbench }) {
  let graph = null;
  const refresh = () => {
    const current = surface?.querySelector?.("[data-canvas-minimap]");
    const markup = renderCanvasMinimap(workbench.ui);
    if (!current || !markup || typeof document === "undefined") return false;
    const template = document.createElement("template");
    template.innerHTML = markup;
    current.replaceWith(template.content.firstElementChild);
    return true;
  };
  const graphRefresh = () => refresh();
  return {
    bind(nextGraph) {
      if (graph === nextGraph) return;
      if (graph?.off) {
        for (const name of ["node:moved", "node:resized", "node:added", "node:removed"]) graph.off(name, graphRefresh);
      }
      graph = nextGraph;
      if (graph?.on) {
        for (const name of ["node:moved", "node:resized", "node:added", "node:removed"]) graph.on(name, graphRefresh);
      }
      refresh();
    },
    handleAction(target) {
      const action = String(target?.dataset?.minimapAction ?? "");
      if (!action || !graph) return false;
      if (action === "fit") {
        const mount = surface?.querySelector?.("[data-canvas-x6-mount]");
        const mountRect = mount?.getBoundingClientRect?.();
        const fit = canvasGraphFitViewport(workbench.ui?.canvasDocument?.nodes, {
          width: Number(mount?.clientWidth ?? 0) || Number(mountRect?.width ?? 0),
          height: Number(mount?.clientHeight ?? 0) || Number(mountRect?.height ?? 0),
        });
        if (fit && typeof graph.zoomTo === "function" && typeof graph.translate === "function") {
          graph.zoomTo(fit.scale);
          graph.translate(fit.translateX, fit.translateY);
        } else if (typeof graph.zoomToFit === "function") {
          graph.zoomToFit({ padding: 48, maxScale: 1.2 });
        } else graph.centerContent?.();
        return true;
      }
      if (action === "focus") {
        const nodeId = String(target.dataset.nodeId ?? "");
        const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === nodeId);
        if (!node) return false;
        const width = Number(node.size?.width ?? node.width ?? 280) || 280;
        const height = Number(node.size?.height ?? node.height ?? 180) || 180;
        graph.centerPoint?.(Number(node.position?.x ?? node.x ?? 0) + width / 2, Number(node.position?.y ?? node.y ?? 0) + height / 2);
        const cell = graph.getCellById?.(nodeId);
        if (cell?.isNode?.()) graph.select?.(cell);
        workbench.ui.selectedCanvasNodeId = nodeId;
        refresh();
        return true;
      }
      return false;
    },
    refresh,
    dispose() {
      if (graph?.off) {
        for (const name of ["node:moved", "node:resized", "node:added", "node:removed"]) graph.off(name, graphRefresh);
      }
      graph = null;
    },
  };
}

export function canvasGraphFitViewport(nodes, viewport = {}, padding = 48) {
  if (!Array.isArray(nodes) || !nodes.length) return null;
  const width = Number(viewport?.width ?? 0);
  const height = Number(viewport?.height ?? 0);
  if (!(width > 0) || !(height > 0)) return null;
  const boxes = nodes.map((node) => {
    const x = Number(node.position?.x ?? node.x ?? 0) || 0;
    const y = Number(node.position?.y ?? node.y ?? 0) || 0;
    const nodeWidth = Math.max(1, Number(node.size?.width ?? node.width ?? 280) || 280);
    const nodeHeight = Math.max(1, Number(node.size?.height ?? node.height ?? 180) || 180);
    return { x, y, width: nodeWidth, height: nodeHeight };
  });
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const contentWidth = Math.max(1, right - left);
  const contentHeight = Math.max(1, bottom - top);
  const scale = Math.max(0.35, Math.min(1.2, (width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight));
  return {
    centerX: left + contentWidth / 2,
    centerY: top + contentHeight / 2,
    scale,
    translateX: (width - contentWidth * scale) / 2 - left * scale,
    translateY: (height - contentHeight * scale) / 2 - top * scale,
  };
}

function minimapBounds(nodes) {
  const boxes = nodes.map((node) => {
    const x = Number(node.position?.x ?? node.x ?? 0) || 0;
    const y = Number(node.position?.y ?? node.y ?? 0) || 0;
    const width = Math.max(1, Number(node.size?.width ?? node.width ?? 280) || 280);
    const height = Math.max(1, Number(node.size?.height ?? node.height ?? 180) || 180);
    return { x, y, width, height };
  });
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const padding = Math.max(80, Math.max(right - left, bottom - top) * 0.08);
  return { left: left - padding, top: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
}

function renderMinimapNode(node, bounds, selected) {
  const x = Number(node.position?.x ?? node.x ?? 0) || 0;
  const y = Number(node.position?.y ?? node.y ?? 0) || 0;
  const width = Math.max(1, Number(node.size?.width ?? node.width ?? 280) || 280);
  const height = Math.max(1, Number(node.size?.height ?? node.height ?? 180) || 180);
  const style = `left:${percent(x - bounds.left, bounds.width)}%;top:${percent(y - bounds.top, bounds.height)}%;width:${percent(width, bounds.width)}%;height:${percent(height, bounds.height)}%`;
  return `<button type="button" class="new-canvas-minimap-node ${selected ? "selected" : ""}" style="${style}" data-minimap-action="focus" data-node-id="${escapeAttr(node.id)}" title="${escapeAttr(node.data?.title ?? node.data?.label ?? node.id)}" aria-label="定位到 ${escapeAttr(node.data?.title ?? node.data?.label ?? node.id)}"></button>`;
}

function percent(value, total) {
  return Math.max(0, Math.min(100, value / Math.max(1, total) * 100)).toFixed(3);
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
