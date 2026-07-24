export function resolveCanvasFilesPresentation(presentation, viewRequest) {
  const requestedView = typeof viewRequest === "string"
    ? viewRequest
    : String(viewRequest?.view ?? "").trim();
  return {
    dedicatedAssetsDialog: presentation === "dialog" && requestedView === "assets",
    dedicatedCharacterDialog: presentation === "dialog" && requestedView === "library-character",
    dedicatedHistoryDialog: presentation === "dialog" && requestedView === "history",
    dedicatedStyleDialog: presentation === "dialog" && requestedView === "library-style",
    requestedView,
  };
}

export function orderCanvasPanelEntries(entries, order = "front-to-back") {
  if (!Array.isArray(entries) || order !== "back-to-front") return entries;
  return entries.slice().reverse();
}

export function resolveCanvasFileRowMenuKeyAction({ key, shiftKey = false } = {}) {
  if (key !== "Tab") return { handled: false };
  return { handled: true, close: true, focus: shiftKey ? "previous" : "next" };
}

export function resolveCanvasFilesDialogTabAction({ key, shiftKey = false, currentIndex = -1, itemCount = 0 } = {}) {
  if (key !== "Tab") return { handled: false };
  const count = Math.max(0, Number(itemCount) || 0);
  if (!count) return { handled: true, focus: "dialog" };
  if (currentIndex < 0) return { handled: true, nextIndex: shiftKey ? count - 1 : 0 };
  if (shiftKey && currentIndex === 0) return { handled: true, nextIndex: count - 1 };
  if (!shiftKey && currentIndex === count - 1) return { handled: true, nextIndex: 0 };
  return { handled: false };
}

const CANVAS_FILES_DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function installCanvasFilesDialogTabTrap(ownerDocument, panelElement) {
  if (!ownerDocument?.addEventListener || !panelElement?.querySelectorAll) return () => {};
  const handleKeyDown = (event) => {
    if (ownerDocument.activeElement?.closest?.('[data-canvas-files-dialog-portal="true"]')) return;
    const focusableElements = Array.from(
      panelElement.querySelectorAll(CANVAS_FILES_DIALOG_FOCUSABLE_SELECTOR),
    ).filter((element) => {
      if (element.hidden || element.closest?.('[hidden], [aria-hidden="true"]')) return false;
      const style = ownerDocument.defaultView?.getComputedStyle?.(element);
      return style?.display !== "none"
        && style?.visibility !== "hidden"
        && (element.getClientRects?.().length ?? 0) > 0;
    });
    const action = resolveCanvasFilesDialogTabAction({
      key: event.key,
      shiftKey: event.shiftKey,
      currentIndex: focusableElements.indexOf(ownerDocument.activeElement),
      itemCount: focusableElements.length,
    });
    if (!action.handled) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const focusTarget = action.focus === "dialog"
      ? panelElement
      : focusableElements[action.nextIndex] ?? panelElement;
    focusTarget.focus?.({ preventScroll: true });
  };
  ownerDocument.addEventListener("keydown", handleKeyDown, true);
  return () => ownerDocument.removeEventListener("keydown", handleKeyDown, true);
}

export function resolveCanvasFilesDialogFallbackSelector(view) {
  return {
    assets: ".loomic-asset-manager-button",
    "library-style": '.loomic-tool-button[aria-label="素材库"]',
    "library-character": '.loomic-tool-button[aria-label="角色库"]',
    history: '.loomic-tool-button[aria-label="历史记录"]',
  }[String(view ?? "").trim()] ?? "";
}

export function canvasAssetTypeOptions() {
  return [
    { value: "all", label: "全部" },
    { value: "other", label: "其它" },
    { value: "character", label: "人物" },
    { value: "scene", label: "场景" },
    { value: "prop", label: "物品" },
    { value: "style", label: "风格" },
    { value: "audio", label: "音效" },
  ];
}

export function canvasAssetSourceOptions() {
  return [
    { value: "all", label: "全部资产" },
    { value: "personal-library", label: "个人资产库" },
    { value: "official-library", label: "官方素材" },
    { value: "team-library", label: "团队素材" },
    { value: "canvas-local", label: "画布复用" },
  ];
}

export function canvasDedicatedAssetSourceOptions() {
  return [
    { value: "personal-library", label: "个人资产库" },
  ];
}

export function canvasHistoryTypeOptions(counts = {}, dedicatedHistoryDialog = false) {
  const image = Number(counts.image) || 0;
  const video = Number(counts.video) || 0;
  const audio = Number(counts.audio) || 0;
  if (dedicatedHistoryDialog) {
    return [
      { value: "image", label: "图片历史", count: image },
      { value: "video", label: "视频历史", count: video },
      { value: "audio", label: "音频历史", count: audio },
    ];
  }
  return [
    { value: "all", label: "全部", count: image + video + audio },
    { value: "image", label: "图片", count: image },
    { value: "video", label: "视频", count: video },
    { value: "audio", label: "音频", count: audio },
  ];
}
