import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCanvasShotlistDuration,
  normalizeCanvasShotlistRows,
  parseCanvasShotlistText,
  renderCanvasShotlistNodeBody,
} from "../src/features/production-workbench/canvas/canvas-shotlist-node.js";
import { buildCanvasNoteStylePatch, normalizeCanvasNoteLineType, normalizeCanvasNotePoints, normalizeCanvasNoteStyle, renderCanvasNoteEditorFields, renderCanvasNoteNode, renderCanvasNotePointControls, resizeCanvasNoteDataPoints, scaleCanvasNotePoints } from "../src/features/production-workbench/canvas/canvas-note-node.js";
import { renderCanvasStyleGuide } from "../src/features/new-canvas/canvas-style-guide.js";
import {
  buildCanvasVideoEditorExportPayload,
  buildCanvasVideoEditorAiTransitionPayload,
  buildCanvasVideoEditorServerExportPayload,
  canCanvasVideoEditorUseServerExport,
  createCanvasVideoEditorFramePlan,
  computeCanvasVideoEditorDuration,
  downloadCanvasVideoEditorTimeline,
  downloadCanvasVideoEditorMedia,
  encodeCanvasVideoEditorTimeline,
  normalizeCanvasVideoEditorClip,
  normalizeCanvasVideoEditorAudioTrack,
  normalizeCanvasVideoEditorTransition,
  renderCanvasVideoEditorShell,
  resolveCanvasVideoEditorExportFormat,
  selectCanvasVideoEditorEncoding,
} from "../src/features/new-canvas/canvas-video-editor.js";

test("Shotlist normalizes rows, parses generated JSON, and renders an editable table", () => {
  const rows = normalizeCanvasShotlistRows([{ shotNo: 2, content: "屋顶", duration: 4 }]);
  assert.equal(rows[0].shotNo, "2");
  assert.equal(computeCanvasShotlistDuration(rows), 4);
  assert.equal(parseCanvasShotlistText(JSON.stringify({ shots: [{ shotNo: 1, content: "街道", duration: 2 }] }))[0].content, "街道");
  const markup = renderCanvasShotlistNodeBody({ id: "shotlist-1", data: { shotlistRows: rows } });
  assert.match(markup, /data-shotlist-field="content"/);
  assert.match(markup, /屋顶/);
  assert.match(markup, /data-action="open-canvas-shotlist-picker"/);
});

test("Canvas Note renders text and shape notes without opening a generation editor", () => {
  assert.match(renderCanvasNoteNode({ id: "note-1", data: { text: "镜头备注" } }), /镜头备注/);
  assert.match(renderCanvasNoteNode({ id: "note-2", data: { noteKind: "arrow" } }), /canvas-note-shape/);
  assert.equal(normalizeCanvasNoteStyle({ opacity: 140, strokeWidth: 99 }).opacity, 100);
  assert.equal(normalizeCanvasNoteStyle({ opacity: -4, strokeWidth: 99 }).strokeWidth, 2);
  assert.equal(normalizeCanvasNoteStyle({ strokeColor: "#fff; color:red", backgroundColor: "url(javascript:alert(1))" }).strokeColor, "#f3c969");
});

test("Canvas Note style controls normalize supported fields and expose a reset action", () => {
  const style = buildCanvasNoteStylePatch({}, "fontSize", 200);
  assert.equal(style.fontSize, 96);
  assert.equal(buildCanvasNoteStylePatch({}, "strokeStyle", "invalid").strokeStyle, "solid");
  assert.equal(buildCanvasNoteStylePatch({}, "unknown", "x"), null);
  const markup = renderCanvasNoteEditorFields({ data: { noteStyle: { opacity: 42 } } });
  assert.match(markup, /data-canvas-note-style="opacity"/);
  assert.match(markup, /data-action="reset-canvas-note-style"/);
  assert.match(markup, /value="42"/);
});

test("Canvas Note geometry keeps bounded custom points and renders them", () => {
  const points = normalizeCanvasNotePoints([{ x: -4, y: 20 }, { x: 500, y: 999 }], 320, 220);
  assert.deepEqual(points, [{ x: 0, y: 20 }, { x: 320, y: 220 }]);
  const markup = renderCanvasNoteNode({ id: "note-points", data: { noteKind: "freehand", points } });
  assert.match(markup, /M 0 20 L 320 220/);
  assert.equal(normalizeCanvasNoteLineType("bezier"), "straight");
  assert.equal(normalizeCanvasNoteLineType("CURVED"), "curved");
  const curved = renderCanvasNoteNode({ id: "note-curved", data: { noteKind: "line", lineType: "curved", points: [{ x: 0, y: 10 }, { x: 160, y: 200 }, { x: 320, y: 20 }] } });
  assert.match(curved, /Q 160 200 240 110/);
  const legacy = renderCanvasNoteNode({ id: "note-legacy", data: { noteKind: "freehand" } });
  assert.match(legacy, /M 4 110 Q 160 77 316 110/);
});

test("Canvas Note geometry exposes draggable controls and scales persisted points on resize", () => {
  const controls = renderCanvasNotePointControls([{ x: 4, y: 10 }, { x: 100, y: 20 }], "#abc", 2);
  assert.match(controls, /data-canvas-note-point-controls/);
  assert.match(controls, /data-canvas-note-point-index="1"/);
  assert.deepEqual(scaleCanvasNotePoints([{ x: 10, y: 20 }, { x: 100, y: 80 }], 200, 100, 400, 200), [
    { x: 20, y: 40 },
    { x: 200, y: 160 },
  ]);
  const nested = resizeCanvasNoteDataPoints({ type: "canvas-note", size: { width: 200, height: 100 }, data: { note: { noteKind: "line", points: [{ x: 10, y: 20 }, { x: 100, y: 80 }] } } }, 400, 200);
  assert.deepEqual(nested.data.note.points[1], { x: 200, y: 160 });
  const flat = resizeCanvasNoteDataPoints({ type: "canvas-note", size: { width: 200, height: 100 }, data: { noteKind: "line", points: [{ x: 10, y: 20 }, { x: 100, y: 80 }] } }, 400, 200);
  assert.deepEqual(flat.data.points[0], { x: 20, y: 40 });
  assert.equal(resizeCanvasNoteDataPoints({ type: "text", data: { points: [{ x: 1, y: 2 }] } }, 400, 200).type, "text");
});

test("Canvas StyleGuide exposes the shared control vocabulary", () => {
  const markup = renderCanvasStyleGuide({ canvasStyleGuideOpen: true });
  assert.match(markup, /data-canvas-style-guide/);
  assert.match(markup, /样式指南/);
  assert.match(markup, /<select/);
  assert.match(markup, /canvas-style-guide-status-badge/);
});

test("Web video editor shell persists an in/out timeline surface", () => {
  const markup = renderCanvasVideoEditorShell({ canvasVideoEditor: {
    open: true,
    nodeId: "edit-1",
    title: "智能剪辑",
    clips: [{ id: "clip-1", nodeId: "video-1", label: "镜头 1", kind: "video", source: "/video.mp4", sourceIn: 1, sourceOut: 3, duration: 5 }],
  } });
  assert.match(markup, /视频剪辑器/);
  assert.match(markup, /data-video-editor-field="sourceIn"/);
  assert.match(markup, /value="3"/);
  assert.match(markup, /data-video-editor-field="transitionKind"/);
});

test("video editor normalizes transitions and accounts for overlap in duration", () => {
  const first = normalizeCanvasVideoEditorClip({ id: "a", sourceIn: 0, sourceOut: 4 });
  const second = normalizeCanvasVideoEditorClip({ id: "b", sourceIn: 0, sourceOut: 5, transitionIn: { kind: "dissolve", duration: 1.5 } });
  assert.equal(normalizeCanvasVideoEditorTransition({ kind: "unknown", duration: 99 }).kind, "none");
  assert.equal(second.transitionIn.duration, 1.5);
  assert.equal(computeCanvasVideoEditorDuration([first, second]), 7.5);
  const imagePlan = createCanvasVideoEditorFramePlan([
    { id: "still", kind: "image", sourceIn: 0, sourceOut: 3, duration: 3 },
  ], 10);
  assert.equal(imagePlan.duration, 3);
});

test("video editor export payload preserves ordered clips and transition duration", () => {
  const payload = buildCanvasVideoEditorExportPayload({
    nodeId: "edit-1",
    title: "剪辑/预览",
    clips: [
      { id: "a", source: "/a.mp4", sourceIn: 0, sourceOut: 4, duration: 4 },
      { id: "b", source: "/b.mp4", sourceIn: 1, sourceOut: 5, duration: 5, transitionIn: { kind: "dissolve", duration: 1 } },
    ],
  }, { ui: { selectedCanvasProjectId: "project-1" } });
  assert.equal(payload.format, "comic-ai.canvas-video-timeline");
  assert.equal(payload.canvasProjectId, "project-1");
  assert.deepEqual(payload.clips.map((clip) => [clip.order, clip.id]), [[1, "a"], [2, "b"]]);
  assert.equal(payload.totalDuration, 7);
});

test("video editor server payload preserves storage IDs and trim metadata", () => {
  const editor = {
    nodeId: "edit-1",
    clips: [
      { id: "a", storageObjectId: "storage-a", sourceIn: 1, sourceOut: 3, duration: 4 },
      { id: "b", storageObjectId: "storage-b", sourceIn: 0, sourceOut: 2.5, duration: 2.5, transitionIn: { kind: "fade", duration: 0.4 } },
    ],
  };
  assert.equal(canCanvasVideoEditorUseServerExport(editor), true);
  assert.deepEqual(buildCanvasVideoEditorServerExportPayload(editor, { width: 1920, height: 1080, fps: 24 }), {
    nodeKey: "edit-1",
    width: 1920,
    height: 1080,
    fps: 24,
    clips: [
      { storageObjectId: "storage-a", durationSeconds: 2, sourceIn: 1, sourceOut: 3, transitionIn: { kind: "none", duration: 0 } },
      { storageObjectId: "storage-b", durationSeconds: 2.5, sourceIn: 0, sourceOut: 2.5, transitionIn: { kind: "fade", duration: 0.4 } },
    ],
  });
  assert.equal(canCanvasVideoEditorUseServerExport({ clips: [{ sourceIn: 0, sourceOut: 1, source: "/tmp.mp4" }] }), false);
});

test("video editor AI transition payload uses ordered first and last frame references", () => {
  const payload = buildCanvasVideoEditorAiTransitionPayload(
    { aiTransitionPrompt: "穿过火光自然衔接", aiTransitionDuration: 4 },
    { data: { modelCode: "video-model-1" } },
    "storage-first",
    "storage-last",
  );
  assert.equal(payload.kind, "video");
  assert.equal(payload.model, "video-model-1");
  assert.equal(payload.motionPrompt, "穿过火光自然衔接");
  assert.deepEqual(payload.parameters.referenceImages, [
    { storageObjectId: "storage-first", role: "first_frame" },
    { storageObjectId: "storage-last", role: "last_frame" },
  ]);
  assert.equal(payload.parameters.videoDuration, 4);
});

test("video editor server payload preserves multiple audio tracks and timeline controls", () => {
  const editor = {
    nodeId: "edit-audio",
    clips: [{ id: "clip", storageObjectId: "storage-video", sourceIn: 0, sourceOut: 2, duration: 2 }],
    audioTracks: [
      { id: "voice", storageObjectId: "storage-voice", sourceIn: 0, sourceOut: 2, volume: 0.8, fadeOut: 0.2 },
      { id: "music", storageObjectId: "storage-music", sourceIn: 1, sourceOut: 4, volume: 0.4, timelineIn: 0.5, fadeIn: 0.3 },
    ],
  };
  assert.deepEqual(normalizeCanvasVideoEditorAudioTrack(editor.audioTracks[1]), {
    id: "music", nodeId: "", label: "音频轨", source: "", storageObjectId: "storage-music",
    sourceIn: 1, sourceOut: 4, volume: 0.4, timelineIn: 0.5, fadeIn: 0.3, fadeOut: 0,
  });
  const payload = buildCanvasVideoEditorServerExportPayload(editor);
  assert.equal(payload.audio, undefined);
  assert.deepEqual(payload.audioTracks, [
    { storageObjectId: "storage-voice", sourceIn: 0, sourceOut: 2, volume: 0.8, fadeOut: 0.2 },
    { storageObjectId: "storage-music", sourceIn: 1, sourceOut: 4, volume: 0.4, timelineIn: 0.5, fadeIn: 0.3 },
  ]);
});

test("video editor timeline download reports a stable filename and revokes its object URL", async () => {
  const clicked = [];
  const revoked = [];
  const result = downloadCanvasVideoEditorTimeline({ title: "我的剪辑", clips: [] }, {
    documentRef: { createElement: () => ({ click: () => clicked.push(true) }) },
    urlApi: {
      createObjectURL: () => "blob:timeline",
      revokeObjectURL: (href) => revoked.push(href),
    },
  });
  assert.equal(result.filename, "我的剪辑.json");
  assert.equal(clicked.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revoked, ["blob:timeline"]);
});

test("video editor media download uses the encoded file extension and MIME type", async () => {
  const clicked = [];
  const revoked = [];
  const file = new Blob(["video"], { type: "video/webm" });
  const result = downloadCanvasVideoEditorMedia({ file, fileExtension: "webm", mimeType: "video/webm" }, {
    title: "成片",
    documentRef: { createElement: () => ({ click: () => clicked.push(true) }) },
    urlApi: { createObjectURL: () => "blob:video", revokeObjectURL: (href) => revoked.push(href) },
  });
  assert.equal(result.filename, "成片.webm");
  assert.equal(result.mimeType, "video/webm");
  assert.equal(clicked.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revoked, ["blob:video"]);
});

test("video editor builds deterministic frames across trimmed clips and transitions", () => {
  const plan = createCanvasVideoEditorFramePlan([
    { id: "a", sourceIn: 1, sourceOut: 3, duration: 4 },
    { id: "b", sourceIn: 2, sourceOut: 5, duration: 5, transitionIn: { kind: "dissolve", duration: 0.5 } },
  ], 10);
  assert.equal(plan.frameRate, 10);
  assert.equal(plan.duration, 4.5);
  assert.equal(plan.frames.length, 45);
  assert.equal(plan.frames[0].clip.id, "a");
  assert.equal(plan.frames.at(-1).clip.id, "b");
  assert.ok(plan.frames.every((frame) => frame.duration > 0 && frame.clipTime >= frame.clip.sourceIn));
});

test("video editor selects requested WebM or MP4 codec using browser capability probing", async () => {
  const checked = [];
  const webm = await selectCanvasVideoEditorEncoding({ width: 640, height: 360, format: "webm" }, async (codec) => {
    checked.push(codec);
    return codec === "vp8";
  });
  assert.deepEqual(checked, ["vp9", "vp8"]);
  assert.deepEqual(webm, { codec: "vp8", format: "webm", bitrate: 4_000_000 });
  const mp4 = await selectCanvasVideoEditorEncoding({ width: 640, height: 360, format: "mp4" }, async (codec) => codec === "avc");
  assert.deepEqual(mp4, { codec: "avc", format: "mp4", bitrate: 4_000_000 });
  assert.equal(resolveCanvasVideoEditorExportFormat("MOV"), "auto");
  assert.equal(resolveCanvasVideoEditorExportFormat("webm"), "webm");
});

test("video editor media encoder fails explicitly when a frame renderer is unavailable", async () => {
  await assert.rejects(
    encodeCanvasVideoEditorTimeline({ canvas: {}, clips: [{ id: "a", sourceIn: 0, sourceOut: 1, duration: 1 }] }),
    /video_editor_canvas_unavailable/,
  );
});
