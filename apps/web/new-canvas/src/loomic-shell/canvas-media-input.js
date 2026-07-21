function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName ?? "").toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || target.isContentEditable) return true;
  return Boolean(target.closest?.("[contenteditable='true'], [role='textbox']"));
}

export function canHandleCanvasMediaInput(event, { viewMode = "workflow", kind = "drop" } = {}) {
  if (viewMode !== "workflow" || isTypingTarget(event?.target)) return false;
  if (kind === "paste") {
    return Array.from(event?.clipboardData?.files ?? []).some((file) => file.type?.startsWith("image/"));
  }
  return Array.from(event?.dataTransfer?.types ?? []).includes("Files");
}
