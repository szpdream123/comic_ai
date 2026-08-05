const PAGE_SOURCE = "comic-ai-video-depth-page";
const EXTENSION_SOURCE = "comic-ai-video-depth-extension";
const REQUEST_TYPE = "comic-ai-video-depth-request";
const RESPONSE_TYPE = "comic-ai-video-depth-response";
const READY_TYPE = "comic-ai-video-depth-ready";

announceReady();

window.addEventListener("message", async (event) => {
  if (event.source !== window) {
    return;
  }

  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE || message.type !== REQUEST_TYPE) {
    return;
  }

  try {
    const payload = await chrome.runtime.sendMessage({
      target: "service-worker",
      type: "page-request",
      payload: message.payload
    });

    respond(message.requestId ?? null, payload);
  } catch (error) {
    respond(message.requestId ?? null, {
      protocol: "comic-ai-video-depth/v1",
      requestId: message.payload?.requestId ?? null,
      ok: false,
      error: {
        code: "extension_unavailable",
        message: error?.message || "The video-depth extension could not be reached."
      }
    });
  }
});

function announceReady() {
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type: READY_TYPE
    },
    window.location.origin
  );
}

function respond(requestId, payload) {
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type: RESPONSE_TYPE,
      requestId,
      payload
    },
    window.location.origin
  );
}
