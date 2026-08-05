# Comic AI Local Compute Assistant

Windows background companion for the toolbox's video-to-depth tool. It exposes the existing loopback API at `http://127.0.0.1:48123`, so the web application does not need a Python, CUDA, or browser-extension environment.

## What it does

- Runs only on the user's computer and binds only to `127.0.0.1`.
- Uses Electron's renderer WebGPU implementation with `onnx-community/depth-anything-v2-small` through `@huggingface/transformers`.
- Downloads the quantized model on first processing request, then uses the local browser cache.
- Accepts `POST /jobs` multipart field `file`; provides `GET /health`, `GET /jobs/:id`, and `GET /jobs/:id/output`.
- Produces WebM depth video at 640px maximum edge and 8 FPS in this minimal first release.

## Build a Windows installer

This directory is deliberately independent from the main application's `package.json`.

```powershell
cd plugins/local-compute-assistant
npm install
npm run dist:win
```

The NSIS installer is emitted under `dist/`. It is a per-user, one-click installer and launches the background assistant after installation. Build and sign it in your release pipeline before distributing it.

## Product configuration

The existing web page already uses `http://127.0.0.1:48123`, so no page code is required for the local API itself. Configure deployment with the installer URLs below:

```js
globalThis.__COMIC_AI_LOCAL_COMPUTE_ASSISTANT_INSTALLERS__ = {
  windows: {
    appInstallerUrl: "https://downloads.example.com/comic-ai/Comic-AI-Local-Compute-Assistant.appinstaller",
    downloadUrl: "https://downloads.example.com/comic-ai/Comic-AI-Local-Compute-Assistant-Setup.exe",
  },
  macos: {
    downloadUrl: "https://downloads.example.com/comic-ai/Comic-AI-Local-Compute-Assistant.dmg",
  },
  linux: {
    downloadUrl: "https://downloads.example.com/comic-ai/comic-ai-local-compute-assistant.AppImage",
  },
};
```

Windows 10/11 should use a signed `.appinstaller` file: a single page click opens Windows App Installer, which downloads and installs the package, then starts the assistant. Other systems receive an in-page download with progress because browsers do not allow a website to execute downloaded native installers.

## Limits and support

- Requires Windows and an Electron version with WebGPU support, plus a compatible GPU/driver.
- The first run needs internet access for the model download. This is intentional to keep the installer small; package the model separately only if offline first use is required.
- This source tree contains no model, Electron runtime, installer output, or binary artifacts.
