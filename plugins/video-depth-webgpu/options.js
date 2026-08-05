document.querySelector("#extension-id").textContent = chrome.runtime.id;

const status = document.querySelector("#status");
if (!navigator.gpu) {
  status.textContent = "WebGPU is unavailable in this browser. Local depth inference requires a WebGPU-capable browser and GPU.";
} else {
  navigator.gpu.requestAdapter()
    .then((adapter) => {
      status.textContent = adapter
        ? "WebGPU is available. The extension can prepare local depth processing on this device."
        : "WebGPU is enabled but no compatible adapter is available.";
    })
    .catch(() => {
      status.textContent = "WebGPU capability could not be checked.";
    });
}
