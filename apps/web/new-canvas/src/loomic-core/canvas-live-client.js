import { resolveApiUrl } from "../../../src/shared/creator-api.js";

const RETRY_DELAYS = [500, 1500, 5000, 10000];

export function parseCanvasLiveSseMessage(message) {
  const data = String(message ?? "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    const event = JSON.parse(data);
    return event && typeof event === "object" ? event : null;
  } catch {
    return null;
  }
}

export function subscribeCanvasLive(canvasProjectId, listener, options = {}) {
  const normalizedCanvasProjectId = String(canvasProjectId ?? "").trim();
  if (!normalizedCanvasProjectId || typeof listener !== "function") return () => undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelays = Array.isArray(options.retryDelays) ? options.retryDelays : RETRY_DELAYS;
  const controller = new AbortController();
  let closed = false;
  let retryTimer = null;
  let retryAttempt = 0;

  const clearRetry = () => {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = (connect) => {
    if (closed || controller.signal.aborted) return;
    const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)] ?? 5000;
    retryAttempt += 1;
    clearRetry();
    retryTimer = window.setTimeout(() => void connect(), Math.max(0, Number(delay) || 0));
  };

  const connect = async () => {
    if (closed || controller.signal.aborted) return;
    try {
      const response = await fetchImpl(resolveApiUrl(`/api/canvas/${encodeURIComponent(normalizedCanvasProjectId)}/live`), {
        method: "GET",
        credentials: "include",
        headers: { accept: "text/event-stream" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 404) return;
        throw new Error(`canvas_live_request_failed:${response.status}`);
      }
      const reader = response.body?.getReader?.();
      if (!reader) throw new Error("canvas_live_stream_unavailable");
      retryAttempt = 0;
      const decoder = new TextDecoder();
      let buffer = "";
      while (!closed && !controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const event = parseCanvasLiveSseMessage(part);
          if (event) listener(event);
        }
      }
      if (!closed && !controller.signal.aborted) scheduleRetry(connect);
    } catch (error) {
      if (!closed && !controller.signal.aborted && error?.name !== "AbortError") scheduleRetry(connect);
    }
  };

  void connect();
  return () => {
    if (closed) return;
    closed = true;
    clearRetry();
    controller.abort();
  };
}
