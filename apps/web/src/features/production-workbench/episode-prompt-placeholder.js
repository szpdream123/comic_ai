export const EPISODE_PROMPT_PLACEHOLDER = "先上传参考图，输入你的想法，再用@引用素材";

const INITIAL_FRAME_DELAY_MS = 450;
const NEXT_FRAME_DELAY_MS = 300;
const COMPLETED_FRAME_HOLD_MS = 1600;
const LOOP_RESTART_DELAY_MS = 650;

export function buildEpisodePromptPlaceholderFrames(placeholder = EPISODE_PROMPT_PLACEHOLDER) {
  const characters = [...String(placeholder ?? "")];
  return characters.map((_, index) => characters.slice(0, index + 1).join(""));
}

export function installEpisodePromptPlaceholderAnimation(editorHost, placeholder) {
  const frames = buildEpisodePromptPlaceholderFrames(placeholder);
  const view = editorHost?.ownerDocument?.defaultView ?? globalThis;
  const editorContent = editorHost?.querySelector?.(".episode-prompt-editor-content") ?? null;
  if (!editorContent || typeof view.MutationObserver !== "function") {
    editorHost?.removeAttribute?.("data-animated-placeholder");
    return () => {};
  }
  const reducedMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  const compactViewport = view.matchMedia?.("(max-width: 720px)") ?? null;
  editorContent.setAttribute("aria-placeholder", String(placeholder ?? ""));
  const placeholderElement = editorHost.ownerDocument.createElement("span");
  placeholderElement.className = "episode-prompt-animated-placeholder";
  placeholderElement.setAttribute("aria-hidden", "true");
  const characterElements = frames.map((frame) => {
    const characterElement = editorHost.ownerDocument.createElement("span");
    characterElement.textContent = [...frame].at(-1) ?? "";
    placeholderElement.append(characterElement);
    return characterElement;
  });
  editorHost.append(placeholderElement);
  let frameIndex = 0;
  let timeoutId = null;
  let stopped = false;

  const clearScheduledFrame = () => {
    if (timeoutId !== null) {
      view.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  const emptyParagraph = () => editorContent.querySelector?.("p.is-editor-empty:first-child") ?? null;
  const schedule = (callback, delay) => {
    clearScheduledFrame();
    timeoutId = view.setTimeout(callback, delay);
  };
  const showNextFrame = () => {
    timeoutId = null;
    if (stopped || !emptyParagraph() || !characterElements.length) {
      return;
    }
    characterElements[frameIndex].classList.add("is-visible");
    frameIndex += 1;
    if (frameIndex < frames.length) {
      schedule(showNextFrame, NEXT_FRAME_DELAY_MS);
      return;
    }
    schedule(() => {
      if (!stopped && emptyParagraph()) {
        characterElements.forEach((element) => element.classList.remove("is-visible"));
        frameIndex = 0;
        schedule(showNextFrame, LOOP_RESTART_DELAY_MS);
      }
    }, COMPLETED_FRAME_HOLD_MS);
  };
  const restart = () => {
    clearScheduledFrame();
    frameIndex = 0;
    characterElements.forEach((element) => element.classList.remove("is-visible"));
    const isEmpty = Boolean(emptyParagraph());
    placeholderElement.classList.toggle("is-active", isEmpty);
    if (stopped || !isEmpty || editorHost.ownerDocument.visibilityState === "hidden") {
      return;
    }
    if (reducedMotion?.matches || compactViewport?.matches) {
      characterElements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    schedule(showNextFrame, INITIAL_FRAME_DELAY_MS);
  };
  const observer = new view.MutationObserver(restart);
  observer.observe(editorContent, {
    attributeFilter: ["class"],
    attributes: true,
    childList: true,
    subtree: true,
  });
  reducedMotion?.addEventListener?.("change", restart);
  compactViewport?.addEventListener?.("change", restart);
  editorHost.ownerDocument.addEventListener?.("visibilitychange", restart);
  restart();

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearScheduledFrame();
    observer.disconnect();
    placeholderElement.remove();
    reducedMotion?.removeEventListener?.("change", restart);
    compactViewport?.removeEventListener?.("change", restart);
    editorHost.ownerDocument.removeEventListener?.("visibilitychange", restart);
  };
}
