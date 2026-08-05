export const VIDEO_DEPTH_EXTENSION_PROTOCOL = "comic-ai-video-depth/v1";

export const VIDEO_DEPTH_ACTIONS = Object.freeze({
  PING: "ping",
  PROCESS: "process"
});

export const VIDEO_DEPTH_MAX_INPUT_BYTES = 25 * 1024 * 1024;

export function success(requestId, result) {
  return {
    protocol: VIDEO_DEPTH_EXTENSION_PROTOCOL,
    requestId,
    ok: true,
    result
  };
}

export function failure(requestId, code, message) {
  return {
    protocol: VIDEO_DEPTH_EXTENSION_PROTOCOL,
    requestId,
    ok: false,
    error: { code, message }
  };
}
