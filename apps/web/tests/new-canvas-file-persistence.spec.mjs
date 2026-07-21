import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCanvasImageArchiveResult,
  archiveNewCanvasImageFiles,
  canvasBinaryFileToUploadFile,
  compactCanvasElementsForPersistence,
  compactCanvasFilesForPersistence,
  createCanvasImageArchiveTracker,
  hydrateCanvasElementsForDisplay,
  hydrateCanvasFilesForDisplay,
  isCanvasImageArchiveCandidateCurrent,
  hydrateCanvasContentForDisplay,
  isStableCanvasMediaUrl,
  prepareCanvasReferenceImageSources,
  storageObjectContentUrl,
} from "../new-canvas/src/loomic-core/canvas-file-persistence.js";

const editor = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");
const main = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");

const files = {
  archived: { id: "archived", dataURL: "data:image/png;base64,ARCHIVED", mimeType: "image/png", created: 1 },
  cloud: { id: "cloud", dataURL: "data:image/png;base64,CLOUD", mimeType: "image/png", created: 2 },
  local: { id: "local", dataURL: "data:image/png;base64,LOCAL", mimeType: "image/png", created: 3 },
};

test("persisted canvas files replace archived and cloud base64 data with stable storage URLs", () => {
  const compacted = compactCanvasFilesForPersistence([
    { id: "a", type: "image", fileId: "archived", customData: { cloudArchiveStatus: "archived", storageUrl: "https://cdn.example/archived.png" } },
    { id: "b", type: "image", fileId: "cloud", customData: { source: "official-library", storageUrl: "https://cdn.example/cloud.png" } },
    { id: "c", type: "image", fileId: "local", customData: { cloudArchiveStatus: "local-only" } },
    { id: "d", type: "image", fileId: "generated", customData: { source: "generated", cloudArchiveStatus: "archived", storageUrl: "https://cdn.example/generated.png" } },
  ], {
    ...files,
    generated: { id: "generated", dataURL: "data:image/png;base64,GENERATED", mimeType: "image/png", created: 4 },
  });

  assert.equal(compacted.archived.dataURL, "https://cdn.example/archived.png");
  assert.equal(compacted.cloud.dataURL, "https://cdn.example/cloud.png");
  assert.equal(compacted.local.dataURL, "data:image/png;base64,LOCAL");
  assert.equal(compacted.generated.dataURL, "https://cdn.example/generated.png");
  assert.equal(files.archived.dataURL, "data:image/png;base64,ARCHIVED");
});

test("persistence keeps local data when archive metadata has no stable URL", () => {
  const compacted = compactCanvasFilesForPersistence([
    { id: "a", type: "image", fileId: "archived", customData: { cloudArchiveStatus: "archived" } },
    { id: "b", type: "image", fileId: "cloud", isDeleted: true, customData: { source: "team-library", storageUrl: "https://cdn.example/deleted.png" } },
  ], files);
  assert.equal(compacted.archived.dataURL, "data:image/png;base64,ARCHIVED");
  assert.equal(compacted.cloud, undefined);
});

test("persistence drops files that are no longer referenced after version restore", () => {
  const compacted = compactCanvasFilesForPersistence([], files);
  assert.deepEqual(compacted, {});
});

test("archived uploads hydrate through the authenticated same-origin content route", () => {
  const sourceFiles = {
    uploaded: { id: "uploaded", dataURL: "https://cos.example/uploaded.png", mimeType: "image/png" },
    memory: { id: "memory", dataURL: "data:image/png;base64,abc", mimeType: "image/png" },
  };
  const hydrated = hydrateCanvasFilesForDisplay([
    { id: "uploaded-image", type: "image", fileId: "uploaded", customData: { uploadSessionId: "session/a" } },
    { id: "memory-image", type: "image", fileId: "memory", customData: { uploadSessionId: "session/b" } },
  ], sourceFiles);
  assert.equal(hydrated.uploaded.dataURL, "/api/storage/upload-sessions/session%2Fa/content");
  assert.equal(hydrated.memory.dataURL, "data:image/png;base64,abc");
  assert.equal(sourceFiles.uploaded.dataURL, "https://cos.example/uploaded.png");
});

test("stable storage object ids replace expired image, video, audio, and generation URLs on hydration", () => {
  const source = [
    {
      id: "image",
      type: "image",
      fileId: "image-file",
      customData: { storageObjectId: "image-object", storageUrl: "https://expired.example/image.png" },
    },
    {
      id: "video",
      type: "embeddable",
      link: "https://expired.example/video.mp4",
      customData: { isVideo: true, storageObjectId: "video-object", storageUrl: "https://expired.example/video.mp4" },
    },
    {
      id: "audio",
      type: "rectangle",
      customData: { type: "audio-node", sourceKind: "upload", storageObjectId: "audio-object", mediaUrl: "https://expired.example/audio.mp3" },
    },
    {
      id: "generator",
      type: "rectangle",
      customData: { type: "image-generator", resultStorageObjectId: "result-object", resultUrl: "https://expired.example/result.png", resultUrls: ["https://expired.example/result.png"] },
    },
  ];
  const elements = hydrateCanvasElementsForDisplay(source);
  const files = hydrateCanvasFilesForDisplay(elements, {
    "image-file": { id: "image-file", dataURL: "https://expired.example/image.png", mimeType: "image/png" },
  });

  assert.equal(storageObjectContentUrl("folder/object"), "/api/storage/objects/folder%2Fobject/content");
  assert.equal(elements[0].customData.storageUrl, "/api/storage/objects/image-object/content");
  assert.equal(files["image-file"].dataURL, "/api/storage/objects/image-object/content");
  assert.equal(elements[1].link, "/api/storage/objects/video-object/content");
  assert.equal(elements[1].customData.storageUrl, "/api/storage/objects/video-object/content");
  assert.equal(elements[2].customData.mediaUrl, "/api/storage/objects/audio-object/content");
  assert.equal(elements[2].customData.storageUrl, "/api/storage/objects/audio-object/content");
  assert.equal(elements[3].customData.resultUrl, "/api/storage/objects/result-object/content");
  assert.deepEqual(elements[3].customData.resultUrls, ["/api/storage/objects/result-object/content"]);
  assert.equal(source[1].link, "https://expired.example/video.mp4");
});

test("revision projection hydrates stable object references before adding files or resaving", () => {
  const content = {
    elements: [
      {
        id: "revision-image",
        type: "image",
        fileId: "revision-file",
        customData: {
          source: "generation-history",
          storageObjectId: "revision/object",
          storageUrl: "https://expired.example/revision.png?signature=old",
        },
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {
      "revision-file": {
        id: "revision-file",
        dataURL: "https://expired.example/revision.png?signature=old",
        mimeType: "image/png",
      },
    },
  };

  const hydrated = hydrateCanvasContentForDisplay(content);
  assert.equal(hydrated.elements[0].customData.storageObjectId, "revision/object");
  assert.equal(hydrated.elements[0].customData.storageUrl, "/api/storage/objects/revision%2Fobject/content");
  assert.equal(hydrated.files["revision-file"].dataURL, "/api/storage/objects/revision%2Fobject/content");
  assert.equal(content.files["revision-file"].dataURL, "https://expired.example/revision.png?signature=old");
  assert.match(main, /function applyContentToCanvasApi[\s\S]*?hydrateCanvasContentForDisplay\(content\)/);
  assert.match(main, /function applyVersionContentToCanvasApi[\s\S]*?hydrateCanvasContentForDisplay\(content\)/);
  assert.match(main, /const restoredContent = applyVersionContentToCanvasApi\(canvasApi, entry\.content\);[\s\S]*?canvasStorage\.save\(canvasContext\.canvasId, restoredContent\)/);
});

test("legacy workflow arrows migrate on hydration and retain execution state across persistence", () => {
  const source = [
    { id: "script", type: "text", text: "雨夜" },
    { id: "generator", type: "rectangle", customData: { type: "image-generator" } },
    { id: "legacy", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "generator" } },
    { id: "ordinary", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "generator" }, customData: { workflowEdge: false } },
  ];

  const hydrated = hydrateCanvasElementsForDisplay(source);
  assert.equal(hydrated.find((element) => element.id === "legacy").customData.workflowEdge, true);
  assert.equal(hydrated.find((element) => element.id === "ordinary").customData.workflowEdge, false);
  const refreshed = hydrateCanvasElementsForDisplay(compactCanvasElementsForPersistence(hydrated));
  assert.equal(refreshed.find((element) => element.id === "legacy").customData.workflowEdge, true);
  assert.equal(refreshed.find((element) => element.id === "ordinary").customData.workflowEdge, false);
});

test("video and audio serialization strips ephemeral URLs and preserves retryable placeholders", () => {
  const source = [
    {
      id: "video-local",
      type: "embeddable",
      link: "data:video/mp4;base64,TOO-LARGE",
      customData: { isVideo: true, mediaKind: "video", title: "本地视频", cloudArchiveStatus: "local-only" },
    },
    {
      id: "audio-local",
      type: "rectangle",
      customData: { type: "audio-node", sourceKind: "upload", mediaUrl: "blob:local-audio", fileName: "旁白.mp3", cloudArchiveStatus: "retrying" },
    },
    {
      id: "video-archived",
      type: "embeddable",
      link: "blob:preview",
      customData: { isVideo: true, mediaKind: "video", cloudArchiveStatus: "archived", storageUrl: "https://cdn.example/video.mp4" },
    },
  ];
  const compacted = compactCanvasElementsForPersistence(source);
  assert.equal(compacted[0].link, null);
  assert.equal(compacted[0].customData.archiveRetryState, "needs-file");
  assert.equal(compacted[0].customData.requiresSourceFile, true);
  assert.equal(compacted[1].customData.mediaUrl, undefined);
  assert.equal(compacted[1].customData.archiveError, "云端归档未完成，请重新导入源文件后重试。");
  assert.equal(compacted[2].link, "https://cdn.example/video.mp4");
  assert.equal(compacted[2].customData.archiveRetryState, "archived");
  assert.equal(JSON.stringify(compacted).match(/data:(?:video|audio)\//i), null);
  assert.equal(JSON.stringify(compacted).includes("blob:"), false);
  assert.equal(source[0].link, "data:video/mp4;base64,TOO-LARGE");
  assert.equal(isStableCanvasMediaUrl("https://cdn.example/video.mp4"), true);
  assert.equal(isStableCanvasMediaUrl("/media/video.mp4"), true);
  assert.equal(isStableCanvasMediaUrl("data:video/mp4;base64,AA"), false);
  assert.equal(isStableCanvasMediaUrl("blob:local"), false);
});

test("generator references persist only stable archived URLs when cloud upload is available", async () => {
  const archived = await prepareCanvasReferenceImageSources([{ name: "reference.png" }], {
    async archive(file, options) {
      assert.equal(file.name, "reference.png");
      assert.equal(options.purpose, "new-canvas/reference-image");
      return { storageUrl: "https://cdn.example/reference.png" };
    },
  });
  assert.deepEqual(archived, ["https://cdn.example/reference.png"]);

  await assert.rejects(
    prepareCanvasReferenceImageSources([{ name: "failed.png" }], { async archive() { return null; } }),
    /canvas_reference_image_archive_failed/,
  );
});

test("generator references retain the local data URL fallback without an archive client", async () => {
  const sources = await prepareCanvasReferenceImageSources([{ name: "local.png" }], {
    async read(file) { return `data:image/png;base64,${file.name}`; },
  });
  assert.deepEqual(sources, ["data:image/png;base64,local.png"]);
});

test("native import tracker ignores hydrated files and emits each new image file once", () => {
  const tracker = createCanvasImageArchiveTracker();
  tracker.seed({ hydrated: files.local });
  const currentFiles = {
    hydrated: files.local,
    native: { id: "native", dataURL: "data:image/png;base64,SEVMTE8=", mimeType: "image/png", created: 4 },
    cloud: { id: "cloud-new", dataURL: "data:image/png;base64,Q0xPVUQ=", mimeType: "image/png", created: 5 },
  };
  const elements = [
    { id: "old", type: "image", fileId: "hydrated" },
    { id: "native-element", type: "image", fileId: "native" },
    { id: "cloud-element", type: "image", fileId: "cloud", customData: { source: "personal-library" } },
  ];
  assert.deepEqual(tracker.collect(elements, currentFiles).map(({ fileId, elementId }) => [fileId, elementId]), [
    ["native", "native-element"],
  ]);
  assert.deepEqual(tracker.collect(elements, currentFiles), []);
  assert.equal(tracker.has("hydrated"), true);
  assert.equal(tracker.has("native"), true);
  assert.equal(tracker.has("cloud"), true);

  tracker.release("native");
  elements[1].customData = { source: "uploaded", cloudArchiveStatus: "local-only" };
  assert.deepEqual(tracker.collect(elements, currentFiles).map(({ fileId }) => fileId), ["native"]);
});

test("native data URLs become upload files without changing the Excalidraw binary file", async () => {
  const binary = { id: "native", dataURL: "data:image/png;base64,SEVMTE8=", mimeType: "image/png", created: 4 };
  const upload = canvasBinaryFileToUploadFile("native/id", binary);
  assert.equal(upload.name, "canvas-image-native-id.png");
  assert.equal(upload.type, "image/png");
  assert.equal(Buffer.from(await upload.arrayBuffer()).toString("utf8"), "HELLO");
  assert.equal(binary.dataURL, "data:image/png;base64,SEVMTE8=");
});

test("archive metadata updates image elements while preserving in-memory files", () => {
  const source = [
    { id: "one", type: "image", fileId: "native", version: 1 },
    { id: "two", type: "image", fileId: "native", version: 2, customData: { title: "副本" } },
    { id: "other", type: "image", fileId: "other", version: 1 },
  ];
  const success = applyCanvasImageArchiveResult(source, "native", {
    storageUrl: "https://cdn.example/native.png",
    storageObjectId: "object-1",
    uploadSessionId: "upload-1",
    mimeType: "image/png",
    sourceAction: "new-canvas/native-image-import",
  });
  assert.equal(success.changed, true);
  assert.equal(success.archived, true);
  assert.equal(success.elements[0].customData.cloudArchiveStatus, "archived");
  assert.equal(success.elements[1].customData.title, "副本");
  assert.equal(success.elements[1].customData.storageObjectId, "object-1");
  assert.strictEqual(success.elements[2], source[2]);
  assert.equal(files.local.dataURL, "data:image/png;base64,LOCAL");

  const failure = applyCanvasImageArchiveResult(source, "native", null, {
    sourceAction: "new-canvas/native-image-import",
  });
  assert.equal(failure.archived, false);
  assert.equal(failure.elements[0].customData.cloudArchiveStatus, "local-only");
  assert.equal(failure.elements[0].customData.source, "uploaded");
});

test("native archive event adapter uploads in the background and deduplicates repeated changes", async () => {
  const tracker = createCanvasImageArchiveTracker();
  const binary = { id: "native", dataURL: "data:image/png;base64,SEVMTE8=", mimeType: "image/png" };
  const elements = [{ id: "native-element", type: "image", fileId: "native" }];
  const calls = [];
  const applied = [];
  const input = {
    tracker,
    elements,
    files: { native: binary },
    async archive(file, candidate) {
      calls.push([file.name, candidate.fileId]);
      return { storageUrl: "https://cdn.example/native.png" };
    },
    apply(candidate, archive) {
      applied.push([candidate.fileId, archive.storageUrl]);
    },
  };
  assert.equal((await archiveNewCanvasImageFiles(input)).length, 1);
  assert.equal((await archiveNewCanvasImageFiles(input)).length, 0);
  assert.deepEqual(calls, [["canvas-image-native.png", "native"]]);
  assert.deepEqual(applied, [["native", "https://cdn.example/native.png"]]);
});

test("a stale native image archive cannot overwrite a rebound file or deleted node", async () => {
  const tracker = createCanvasImageArchiveTracker();
  const originalFile = { id: "native", dataURL: "data:image/png;base64,T0xE", mimeType: "image/png" };
  const candidateElements = [{ id: "image", type: "image", fileId: "native", customData: { source: "uploaded", cloudArchiveStatus: "local-only" } }];
  let currentElements = candidateElements;
  let currentFiles = { native: originalFile };
  let finishArchive;
  const applied = [];
  const pending = archiveNewCanvasImageFiles({
    tracker,
    elements: candidateElements,
    files: currentFiles,
    archive: () => new Promise((resolve) => { finishArchive = resolve; }),
    isCurrent: (candidate) => isCanvasImageArchiveCandidateCurrent(candidate, currentElements, currentFiles),
    apply: (candidate, archive) => applied.push([candidate.fileId, archive.storageObjectId]),
  });
  currentFiles = { native: { ...originalFile, dataURL: "data:image/png;base64,TkVX" } };
  currentElements = [{ ...candidateElements[0], customData: { source: "personal-library", cloudArchiveStatus: "archived", storageObjectId: "new-object" } }];
  finishArchive({ storageUrl: "/old.png", storageObjectId: "old-object" });
  const [result] = await pending;
  assert.equal(result.stale, true);
  assert.deepEqual(applied, []);
  assert.equal(currentElements[0].customData.storageObjectId, "new-object");

  assert.equal(isCanvasImageArchiveCandidateCurrent(
    { fileId: "native", file: currentFiles.native },
    [{ ...currentElements[0], isDeleted: true }],
    currentFiles,
  ), false);
});

test("canvas editor connects native drag and clipboard imports to non-blocking archive metadata", () => {
  assert.match(editor, /createCanvasImageArchiveTracker\(initialData\.files \?\? \{\}\)/);
  const hydratedSeed = editor.indexOf("imageArchiveTrackerRef.current.seed(initialData.files ?? {});");
  const archiveScan = editor.indexOf("const archiveNativeCanvasImages = useCallback");
  assert.ok(hydratedSeed > -1 && hydratedSeed < archiveScan, "hydrated files must seed the tracker before archive scanning");
  assert.match(editor, /archiveNewCanvasImageFiles\(\{/);
  assert.match(editor, /isCanvasImageArchiveCandidateCurrent/);
  assert.match(editor, /archiveNativeCanvasImages\((?:elements|currentElements), files\)/);
  assert.match(editor, /const persistentElements = restoreCanvasConnectionsForPersistence\(api, elements\)/);
  assert.match(editor, /compactCanvasElementsForPersistence\(persistentElements\.filter/);
  assert.match(editor, /hydrateCanvasElementsForDisplay\(\s*compactCanvasElementsForPersistence\(hydratedContent\.elements \?\? \[\]\)/);
  assert.match(editor, /hydrateCanvasFilesForDisplay\(elements, hydratedContent\.files \?\? \{\}\)/);
  assert.match(editor, /IMAGE_ARCHIVE_RETRY_DELAYS = \[2000, 10000\]/);
  assert.match(editor, /imageArchiveTrackerRef\.current\.release\(candidate\.fileId\)/);
  assert.match(editor, /captureUpdate: "NONE"/);
  assert.match(editor, /onArchiveImage/);
  assert.match(main, /purpose: "new-canvas\/native-image-import"/);
  assert.match(main, /onArchiveImage=\{archiveNativeCanvasImage\}/);
});
