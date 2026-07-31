import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANVAS_AUDIO_WAVEFORM_COLUMNS,
  bindCanvasMediaControlPointerGuards,
  calculateCanvasAudioSeekPosition,
  calculateCanvasAudioSeekTime,
  captureCanvasVideoFrame,
  decodeCanvasAudioWaveform,
  drawCanvasAudioWaveform,
  extractCanvasAudioWaveform,
  formatCanvasMediaTime,
  isCanvasVideoFrameSecurityError,
  normalizeCanvasVideoFullscreenState,
  reconcileCanvasMediaDocumentSources,
  renderCanvasAudioNodeBody,
  renderCanvasMediaNodeBody,
  renderCanvasVideoFullscreen,
  renderCanvasVideoNodeBody,
  resolveCanvasMediaActionBody,
  resolveCanvasMediaArtifactPatch,
  resolveCanvasMediaNodeSource,
  resolveCanvasMediaUrl,
} from "../src/features/production-workbench/canvas/canvas-media-node.js";
import { renderCanvasSurfaceForHost } from "../src/features/production-workbench/project-detail.js";

test("Canvas audio waveform extracts bounded normalized peaks", () => {
  const source = Float32Array.from([0, -0.5, 0.25, 1.5, -1, 0.75, 0, 0.1]);
  const waveform = extractCanvasAudioWaveform({
    duration: 2.5,
    numberOfChannels: 1,
    getChannelData(channel) {
      assert.equal(channel, 0);
      return source;
    },
  }, { columns: 4 });

  assert.deepEqual(waveform, { peaks: [0.5, 1, 1, 0.1], duration: 2.5, columns: 4 });
  assert.equal(extractCanvasAudioWaveform(new Float32Array(), { columns: 99999 }).columns, 4096);
  assert.equal(extractCanvasAudioWaveform(source).columns, CANVAS_AUDIO_WAVEFORM_COLUMNS);
});

test("Canvas audio waveform decoder uses injectable native fetch and decode APIs", async () => {
  const calls = [];
  const waveform = await decodeCanvasAudioWaveform("/api/storage/audio.mp3", {
    columns: 2,
    async fetchImpl(url, input) {
      calls.push(["fetch", url, input.signal]);
      return { ok: true, status: 200, async arrayBuffer() { return new ArrayBuffer(8); } };
    },
    audioContext: {
      async decodeAudioData(buffer) {
        calls.push(["decode", buffer.byteLength]);
        return { duration: 4, numberOfChannels: 1, getChannelData: () => Float32Array.from([0.2, -0.8]) };
      },
    },
  });
  assert.deepEqual(calls, [["fetch", "/api/storage/audio.mp3", undefined], ["decode", 8]]);
  assert.deepEqual(waveform, { peaks: [0.2, 0.8], duration: 4, columns: 2 });
  await assert.rejects(() => decodeCanvasAudioWaveform("javascript:alert(1)", {}), /音频地址无效/);
});

test("Canvas audio click seeking is clamped and handles invalid geometry", () => {
  assert.deepEqual(calculateCanvasAudioSeekPosition(150, { left: 100, width: 200 }, 80), { ratio: 0.25, time: 20 });
  assert.equal(calculateCanvasAudioSeekTime({ clientX: 999 }, { left: 100, width: 200 }, 80), 80);
  assert.equal(calculateCanvasAudioSeekTime(-999, { left: 100, width: 200 }, 80), 0);
  assert.deepEqual(calculateCanvasAudioSeekPosition(50, { left: 20, width: 0 }, Number.NaN), { ratio: 0, time: 0 });
  assert.equal(formatCanvasMediaTime(65.9), "1:05");
  assert.equal(formatCanvasMediaTime(3661), "1:01:01");
});

test("Canvas audio waveform draws bars and a bounded progress marker", () => {
  const operations = [];
  const context = new Proxy({}, {
    set(target, key, value) { target[key] = value; operations.push(["set", key, value]); return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => operations.push([key, ...args]);
    },
  });
  const canvas = { width: 4, height: 20, getContext: () => context };
  assert.equal(drawCanvasAudioWaveform(canvas, { peaks: [0, 0.5, 1, 0.25] }, { progress: 2 }), true);
  assert.equal(operations.filter(([name]) => name === "fillRect").length, 4);
  assert.deepEqual(operations.find(([name, x]) => name === "moveTo" && x === 4), ["moveTo", 4, 4]);
  assert.equal(drawCanvasAudioWaveform({ getContext: () => null }, { peaks: [1] }), false);
});

test("Canvas video frame capture exports the current native frame as a Blob", async () => {
  const operations = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => operations.push(args) }),
    toBlob(callback, ...args) {
      operations.push(args);
      callback(new Blob(["frame"], { type: "image/png" }));
    },
  };
  const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2, currentTime: 12.3456 };
  const frame = await captureCanvasVideoFrame(video, { canvasFactory: () => canvas });
  assert.equal(frame.blob.type, "image/png");
  assert.equal(await frame.blob.text(), "frame");
  assert.deepEqual({ width: frame.width, height: frame.height, currentTime: frame.currentTime }, {
    width: 1920, height: 1080, currentTime: 12.346,
  });
  assert.deepEqual(operations[0], [video, 0, 0, 1920, 1080]);
  assert.deepEqual(operations[1], ["image/png", undefined]);
  assert.deepEqual([canvas.width, canvas.height], [1920, 1080]);
  await assert.rejects(() => captureCanvasVideoFrame({ videoWidth: 0, videoHeight: 0, readyState: 0 }, { canvasFactory: () => canvas }), /尚未加载/);
});

test("Canvas video frame security errors recognize browser variants", () => {
  assert.equal(isCanvasVideoFrameSecurityError(Object.assign(new Error("blocked"), { name: "SecurityError" })), true);
  assert.equal(isCanvasVideoFrameSecurityError(new Error("Tainted canvases may not be exported")), true);
  assert.equal(isCanvasVideoFrameSecurityError(new Error("decode failed")), false);
});

test("Canvas media fragments expose waveform, seek, frame capture, and fullscreen actions", () => {
  const audio = renderCanvasAudioNodeBody({
    id: 'audio"><script>',
    data: { label: "对白 <1>", audioUrl: "/audio?a=1&b=2", duration: 65, currentTime: 5, audioPlaying: true },
  });
  assert.match(audio, /data-canvas-audio-waveform/);
  assert.match(audio, /data-action="seek-canvas-audio"/);
  assert.match(audio, /data-action="toggle-canvas-audio-play"/);
  assert.match(audio, /0:05 \/ 1:05/);
  assert.match(audio, /src="\/audio\?a=1&amp;b=2"/);
  assert.doesNotMatch(audio, /<script>/i);

  const videoNode = { id: "video-1", type: "ai-video", data: { label: "预览", videoUrl: "/video.mp4", thumbnailUrl: "/poster.png", videoFullscreen: true } };
  const video = renderCanvasVideoNodeBody(videoNode);
  assert.match(video, /data-action="capture-canvas-video-frame"/);
  assert.match(video, /data-action="toggle-canvas-video-play"/);
  assert.match(video, /draggable="false"/);
  assert.doesNotMatch(video, /data-canvas-video-player[^>]*\bcontrols\b/);
  assert.match(video, /data-action="toggle-canvas-video-fullscreen"/);
  assert.doesNotMatch(video, /data-canvas-video-fullscreen-player/);
  assert.match(renderCanvasMediaNodeBody(videoNode), /data-canvas-video-body/);
  assert.match(renderCanvasMediaNodeBody({ type: "source-audio", data: { audioUrl: "/voice.wav" } }), /data-canvas-audio-body/);
});

test("Canvas video fullscreen state and rendering reject unsafe media URLs", () => {
  const state = normalizeCanvasVideoFullscreenState({ data: { videoUrl: "javascript:alert(1)", videoFullscreen: true } });
  assert.deepEqual(state, { open: false, canOpen: false, url: "", poster: "", label: "视频预览" });
  assert.equal(renderCanvasVideoFullscreen({ data: { videoUrl: "/safe.mp4" } }), "");
  assert.doesNotMatch(renderCanvasVideoNodeBody({ data: { videoUrl: "javascript:alert(1)" } }), /javascript:/i);
  assert.equal(resolveCanvasMediaUrl("data:video/mp4;base64,AA", "video"), "");
  assert.equal(resolveCanvasMediaUrl("data:text/html;base64,AA", "video"), "");
  assert.equal(resolveCanvasMediaUrl("tauri://asset/file.mp4", "video"), "");
});

test("Canvas video nodes expose a direct URL fallback when storage proxy is the primary source", () => {
  const html = renderCanvasVideoNodeBody({
    id: "video-fallback",
    type: "ai-video",
    data: {
      storageObjectId: "storage-video-1",
      videoUrl: "https://example.test/video.mp4",
    },
  });
  assert.match(html, /data-canvas-video-fallback-src="https:\/\/example\.test\/video\.mp4"/);
});

test("Canvas media sources prefer stable storage identity and resolve asset versions from the loaded catalog", () => {
  assert.equal(resolveCanvasMediaNodeSource({
    data: {
      storageObjectId: "storage/video 1",
      videoUrl: "https://signed.test/video.mp4?expires=1",
    },
  }, "video"), "/api/storage/objects/storage%2Fvideo%201/content?proxy=1");

  const assets = [{
    assetVersionId: "version-audio-1",
    storageObjectId: "storage-audio-1",
  }];
  assert.equal(resolveCanvasMediaNodeSource({
    data: { assetVersionId: "version-audio-1" },
  }, "audio", { assets }), "/api/storage/objects/storage-audio-1/content?proxy=1");

  const document = {
    nodes: [{ id: "audio-1", type: "source-audio", data: { assetVersionId: "version-audio-1" } }],
    edges: [],
  };
  const reconciled = reconcileCanvasMediaDocumentSources(document, assets);
  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.document.nodes[0].data.storageObjectId, "storage-audio-1");
  assert.equal(document.nodes[0].data.storageObjectId, undefined);
});


test("Canvas media Artifact patches preserve stable version and storage IDs", () => {
  assert.deepEqual(resolveCanvasMediaArtifactPatch({
    result: { assetVersionId: "version-video-1", storageObjectId: "storage-video-1" },
  }), {
    assetVersionId: "version-video-1",
    storageObjectId: "storage-video-1",
  });
});

test("Canvas media toolbar actions find the requested X6 media body and controls stop node dragging", () => {
  const requestedBody = { dataset: { nodeId: "video-2" }, querySelector: () => null };
  const otherBody = { dataset: { nodeId: "video-1" }, querySelector: () => null };
  const root = { querySelectorAll: () => [otherBody, requestedBody] };
  const target = {
    dataset: { nodeId: "video-2" },
    closest: () => null,
    getRootNode: () => root,
  };
  assert.equal(resolveCanvasMediaActionBody(target, { mediaKind: "video" }), requestedBody);

  const events = new Map();
  const control = {
    dataset: {},
    addEventListener(name, listener) { events.set(name, listener); },
  };
  assert.equal(bindCanvasMediaControlPointerGuards({ querySelectorAll: () => [control] }), 1);
  let stopped = 0;
  events.get("pointerdown")({ stopPropagation: () => { stopped += 1; } });
  events.get("mousedown")({ stopPropagation: () => { stopped += 1; } });
  assert.equal(stopped, 2);
  assert.equal(control.dataset.canvasMediaPointerGuard, "true");
  assert.equal(bindCanvasMediaControlPointerGuards({ querySelectorAll: () => [control] }), 1);
});

test("Canvas media pointer guards leave inline video surfaces draggable", () => {
  let selector = "";
  bindCanvasMediaControlPointerGuards({ querySelectorAll: (value) => { selector = value; return []; } });
  assert.doesNotMatch(selector, /data-canvas-video-body\] video/);
  assert.match(selector, /data-canvas-video-body\] button/);
  assert.match(selector, /data-canvas-video-fullscreen\] video/);
});

test("Canvas page video overlay has explicit close and native fullscreen controls", () => {
  const html = renderCanvasVideoFullscreen({
    id: "video-overlay",
    data: { storageObjectId: "storage-overlay", title: "镜头预览" },
  }, { open: true });
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /data-action="close-canvas-video-fullscreen"/);
  assert.match(html, /data-action="request-canvas-video-native-fullscreen"/);
  assert.match(html, /src="\/api\/storage\/objects\/storage-overlay\/content\?proxy=1"/);
  assert.doesNotMatch(html, /data:/i);
});

test("Canvas host hides source media fallback under X6 and renders stable-ID video overlay", () => {
  const html = renderCanvasSurfaceForHost({
    state: {},
    ui: {
      selectedCanvasProjectId: "canvas-media",
      selectedCanvasNodeId: "source-video",
      canvasVideoFullscreen: { open: true, nodeId: "source-video" },
      canvasAssets: [{ assetVersionId: "version-video", storageObjectId: "storage-video" }],
      canvasDocument: {
        version: 1,
        canvasProjectId: "canvas-media",
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "source-video",
            type: "source-video",
            position: { x: 100, y: 100 },
            size: { width: 360, height: 220 },
            data: {
              title: "稳定视频",
              mediaKind: "video",
              assetVersionId: "version-video",
              ports: { inputs: [], outputs: [{ id: "out_video", kind: "video" }] },
            },
          },
          {
            id: "source-audio",
            type: "source-audio",
            position: { x: 520, y: 100 },
            size: { width: 390, height: 220 },
            data: {
              title: "稳定音频",
              mediaKind: "audio",
              storageObjectId: "storage-audio",
              ports: { inputs: [], outputs: [{ id: "out_audio", kind: "audio" }] },
            },
          },
        ],
        edges: [],
      },
    },
  });

  assert.match(html, /canvas-upload-node canvas-special-media-node selected/);
  assert.match(html, /canvas-upload-node canvas-special-media-node\s/);
  assert.match(html, /src="\/api\/storage\/objects\/storage-video\/content\?proxy=1"/);
  assert.match(html, /src="\/api\/storage\/objects\/storage-audio\/content\?proxy=1"/);
  assert.match(html, /data-canvas-video-fullscreen[^>]*role="dialog"/);
  assert.match(html, /data-action="request-canvas-video-native-fullscreen"/);
});

test("Canvas host media actions use node-id lookup, Blob capture, and page overlay state", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const newCanvasSource = readFileSync(
    new URL("../src/features/new-canvas/index.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /resolveCanvasMediaActionBody\(target, \{[\s\S]*?mediaKind: "audio"[\s\S]*?nodeId/);
  assert.match(source, /resolveCanvasMediaActionBody\(target, \{[\s\S]*?mediaKind: "video"[\s\S]*?nodeId/);
  assert.match(source, /action === "toggle-canvas-video-play"/);
  assert.match(source, /canvasVideoPlaybackBound/);
  assert.match(source, /workbench\.ui\.canvasVideoFullscreen = current\?\.open/);
  assert.match(source, /request-canvas-video-native-fullscreen/);
  assert.match(source, /const frame = await captureCanvasVideoFrame\(video\)/);
  assert.match(source, /new File\(\s*\[frame\.blob\]/);
  assert.doesNotMatch(source, /function canvasDataUrlToFile/);
  assert.match(newCanvasSource, /bindCanvasMediaControlPointerGuards\(surface\)/);
});
