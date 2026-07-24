function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function positionCanvasToolPopover(triggerRect = {}, menuRect = {}, viewport = {}, options = {}) {
  const margin = options.margin == null ? 8 : Math.max(0, finite(options.margin));
  const gap = options.gap == null ? 10 : Math.max(0, finite(options.gap));
  const viewportWidth = Math.max(0, finite(viewport.width));
  const viewportHeight = Math.max(0, finite(viewport.height));
  const menuWidth = Math.max(0, finite(menuRect.width));
  const menuHeight = Math.max(0, finite(menuRect.height));
  const triggerLeft = finite(triggerRect.left);
  const triggerTop = finite(triggerRect.top);
  const triggerBottom = finite(triggerRect.bottom)
    || triggerTop + Math.max(0, finite(triggerRect.height));
  const triggerWidth = Math.max(0, finite(triggerRect.width))
    || Math.max(0, finite(triggerRect.right) - triggerLeft);
  const left = clamp(
    triggerLeft + triggerWidth / 2 - menuWidth / 2,
    margin,
    Math.max(margin, viewportWidth - menuWidth - margin),
  );
  const above = triggerTop - gap - menuHeight;
  const preferredTop = above >= margin ? above : triggerBottom + gap;
  const top = clamp(
    preferredTop,
    margin,
    Math.max(margin, viewportHeight - menuHeight - margin),
  );

  return { left, top };
}
