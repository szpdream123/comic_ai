# Comic AI video-depth WebGPU extension

This is a Chrome and Edge Manifest V3 extension for browser-local video processing. It does not use Python, CUDA, a local HTTP service, or application-server GPU resources.

This directory is the local WebGPU depth-processing integration skeleton for Comic AI. The target behavior is: the webpage calls the extension, the extension runs the depth pipeline on the user's browser and GPU, and the processed result is returned without touching the application server GPU.

The current code already covers the installable MV3 shell, page-to-extension messaging, browser capability detection, offscreen video processing, and local result return path. The actual depth inference core can continue evolving inside the same processing path without changing the page protocol.

## Install for development

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable Developer mode.
3. Select **Load unpacked**, then select this `plugins/video-depth-webgpu` directory.

Production installation must publish this directory as a signed Chrome Web Store or Edge Add-ons extension. The webpage can open that store listing from its `Install plugin` button, but Chromium intentionally requires the user to approve the installation; websites cannot silently install extensions.

## Webpage protocol

The host site does not need the extension ID. The extension injects a content script on allowed origins, and the page communicates with it through `window.postMessage`.

```js
window.postMessage(
  {
    source: "comic-ai-video-depth-page",
    type: "comic-ai-video-depth-request",
    requestId: crypto.randomUUID(),
    payload: {
      protocol: "comic-ai-video-depth/v1",
      requestId: crypto.randomUUID(),
      action: "ping"
    }
  },
  window.location.origin
);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "comic-ai-video-depth-extension") return;
  if (event.data?.type !== "comic-ai-video-depth-response") return;
  console.log(event.data.payload);
});
```

Request payloads use the extension protocol directly inside `payload`. `ping` returns WebGPU availability and the configured depth processor name. `process` returns `result.dataUrl`, `result.fileName`, `result.mimeType`, and `result.byteLength`. This minimum implementation accepts video Data URLs up to 25 MB; the webpage should reject larger files before messaging and surface the returned error.

## Allowed origins

Chrome only injects the content script into the origins listed in `manifest.json` under `content_scripts.matches`. Local development supports `localhost` and `127.0.0.1`. Before publishing, replace `https://*.comic-ai.example/*` with the actual production web origin. Do not use a broad wildcard that permits unrelated websites to invoke local processing.

## Scope and next step

The next implementation step is bundling a quantized Depth Anything V2 Small ONNX model with ONNX Runtime Web, downloaded once by the extension and executed through WebGPU. That change stays inside the processing worker/offscreen path, so the page protocol can remain stable.
