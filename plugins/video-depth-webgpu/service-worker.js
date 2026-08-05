import {
  VIDEO_DEPTH_ACTIONS,
  VIDEO_DEPTH_EXTENSION_PROTOCOL,
  VIDEO_DEPTH_MAX_INPUT_BYTES,
  failure,
  success
} from "./protocol.js";

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
let offscreenDocumentPromise = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleExternalMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse(failure(message?.requestId, "internal_error", error.message));
    });

  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "service-worker") {
    return undefined;
  }

  if (message.type === "page-request") {
    handleRuntimeMessage(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendResponse(failure(message?.payload?.requestId, "internal_error", error.message));
      });
    return true;
  }

  return undefined;
});

async function handleExternalMessage(message, sender) {
  return handleRuntimeMessage(message, sender);
}

async function handleRuntimeMessage(message, sender) {
  if (message?.protocol !== VIDEO_DEPTH_EXTENSION_PROTOCOL) {
    return failure(message?.requestId, "unsupported_protocol", "Unsupported extension protocol.");
  }

  if (sender && !sender.url) {
    return failure(message.requestId, "untrusted_sender", "A web page URL is required.");
  }

  if (message.action === VIDEO_DEPTH_ACTIONS.PING) {
    return success(message.requestId, await getCapability());
  }

  if (message.action === VIDEO_DEPTH_ACTIONS.PROCESS) {
    return processVideo(message);
  }

  return failure(message.requestId, "unsupported_action", "Unsupported extension action.");
}

async function getCapability() {
  if (!globalThis.navigator?.gpu) {
    return {
      ready: false,
      webgpu: false,
      processor: "depth-anything-v2-small",
      message: "WebGPU is unavailable. This extension requires a WebGPU-capable browser and GPU for local depth inference."
    };
  }

  let adapter = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    adapter = null;
  }
  if (!adapter) {
    return {
      ready: false,
      webgpu: false,
      processor: "depth-anything-v2-small",
      message: "WebGPU is unavailable on this device."
    };
  }

  return {
    ready: true,
    webgpu: true,
    processor: "depth-anything-v2-small",
    message: "Browser GPU is available. The depth model downloads once on first use."
  };
}

async function processVideo(message) {
  const capability = await getCapability();
  const dataUrl = message?.input?.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:video/")) {
    return failure(message.requestId, "invalid_input", "input.dataUrl must be a video Data URL.");
  }

  if (dataUrl.length > Math.ceil(VIDEO_DEPTH_MAX_INPUT_BYTES * 4 / 3)) {
    return failure(message.requestId, "input_too_large", "The minimal extension accepts videos up to 25 MB.");
  }

  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: "offscreen-document",
    type: "process-video",
    input: {
      dataUrl,
      fileName: message.input.fileName || "depth.webm"
    }
  });

  if (!response?.ok) {
    return failure(message.requestId, response?.error?.code || "processing_failed", response?.error?.message || "Video processing failed.");
  }

  return success(message.requestId, {
    ...response.result,
    processor: "depth-anything-v2-small"
  });
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  if (existingContexts.length > 0) {
    return;
  }

  if (!offscreenDocumentPromise) {
    offscreenDocumentPromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["USER_MEDIA"],
      justification: "Decode uploaded video frames and run the browser-local depth-processing pipeline."
    }).finally(() => {
      offscreenDocumentPromise = null;
    });
  }

  await offscreenDocumentPromise;
}
