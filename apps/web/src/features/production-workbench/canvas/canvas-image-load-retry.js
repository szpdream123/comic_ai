/**
 * 有限的图片加载退避策略。
 * COS 代理和 CDN 结果可能在对象刚写入后短暂不可读；内嵌 data/blob URL
 * 已经是完整内容，不应重复请求。
 */
export const CANVAS_IMAGE_LOAD_RETRY_DELAYS_MS = [400, 1200, 2500];

export function getCanvasImageLoadRetryDelay(failedAttempts = 0) {
  const attempt = Number.isFinite(Number(failedAttempts)) ? Math.max(0, Math.floor(Number(failedAttempts))) : 0;
  return CANVAS_IMAGE_LOAD_RETRY_DELAYS_MS[attempt] ?? null;
}

export function isRetryableCanvasImageSource(source = "") {
  return /^(?:https?:|asset:|\/|\.\/|\.\.\/)/i.test(String(source ?? "").trim());
}

function retrySource(source, attempt) {
  const value = String(source ?? "").trim();
  if (!value) return "";
  // Fragment 不会改变 COS 签名或服务端对象 key，但会让浏览器重新评估资源。
  const hash = `#canvas-image-retry=${attempt}`;
  return `${value.split("#", 1)[0]}${hash}`;
}

/**
 * Bind bounded retry behavior to an image element. Returns an unbind function.
 * Existing fallback handlers can run first; once a fallback is selected, retries
 * continue against that fallback URL as well.
 */
export function bindCanvasImageLoadRetry(image, options = {}) {
  if (!image || typeof image.addEventListener !== "function") return () => {};
  const setTimer = options.setTimeoutImpl ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeoutImpl ?? globalThis.clearTimeout;
  const initialSource = String(image.src || image.currentSrc || "").trim();
  let failedAttempts = 0;
  let timer = null;
  let disposed = false;

  if (typeof setTimer !== "function" || typeof clearTimer !== "function") return () => {};

  const onLoad = () => {
    failedAttempts = 0;
    if (timer !== null) clearTimer(timer);
    timer = null;
    image.dataset && delete image.dataset.canvasImageRetrying;
  };

  const onError = () => {
    if (disposed) return;
    const source = String(image.src || image.currentSrc || initialSource).trim();
    if (!isRetryableCanvasImageSource(source)) return;
    const delay = getCanvasImageLoadRetryDelay(failedAttempts);
    if (delay === null) {
      image.dataset && (image.dataset.canvasImageRetryExhausted = "true");
      return;
    }
    failedAttempts += 1;
    image.dataset && (image.dataset.canvasImageRetrying = String(failedAttempts));
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (disposed) return;
      if ("isConnected" in image && image.isConnected === false) return;
      image.src = retrySource(source, failedAttempts);
    }, delay);
  };

  image.addEventListener("load", onLoad);
  image.addEventListener("error", onError);
  return () => {
    disposed = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    image.removeEventListener?.("load", onLoad);
    image.removeEventListener?.("error", onError);
  };
}
