import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canvasUploadStatusNeedsSourceFile,
  collectCanvasUploadRecoveryCandidates,
  inspectCanvasUploadRecovery,
  markCanvasUploadsForSourceRecovery,
} from "../new-canvas/src/loomic-core/canvas-upload-recovery.js";

function image(id, uploadSessionId, overrides = {}) {
  return {
    id,
    type: "image",
    isDeleted: false,
    version: 1,
    customData: {
      cloudArchiveStatus: "archived",
      uploadSessionId,
      ...overrides,
    },
  };
}

test("archived upload recovery candidates deduplicate sessions across supported media", () => {
  const candidates = collectCanvasUploadRecoveryCandidates([
    image("image-a", "session-shared"),
    image("image-b", "session-shared"),
    {
      id: "video-a",
      type: "embeddable",
      customData: { isVideo: true, cloudArchiveStatus: "archived", uploadSessionId: "session-video" },
    },
    {
      id: "audio-a",
      type: "rectangle",
      customData: { type: "audio-node", sourceKind: "upload", cloudArchiveStatus: "archived", uploadSessionId: "session-audio" },
    },
    image("local-only", "session-local", { cloudArchiveStatus: "local-only" }),
    { id: "not-media", type: "rectangle", customData: { cloudArchiveStatus: "archived", uploadSessionId: "session-shape" } },
  ]);

  assert.deepEqual(candidates, [
    { uploadSessionId: "session-shared", elementIds: ["image-a", "image-b"] },
    { uploadSessionId: "session-video", elementIds: ["video-a"] },
    { uploadSessionId: "session-audio", elementIds: ["audio-a"] },
  ]);
});

test("upload recovery marks only definite terminal states and ignores request failures", async () => {
  assert.equal(canvasUploadStatusNeedsSourceFile({ uploadSession: { status: "uploaded" }, storageObject: { status: "available" } }), false);
  assert.equal(canvasUploadStatusNeedsSourceFile({ uploadSession: { status: "uploading" }, storageObject: { status: "pending_upload" } }), false);
  assert.equal(canvasUploadStatusNeedsSourceFile({ uploadSession: { status: "failed" }, storageObject: { status: "available" } }), true);
  assert.equal(canvasUploadStatusNeedsSourceFile({ uploadSession: { status: "uploaded" }, storageObject: { status: "deleted" } }), true);
  assert.equal(canvasUploadStatusNeedsSourceFile({ uploadSession: { status: "expired" }, storageObject: { status: "available" } }), true);

  const elements = Array.from({ length: 6 }, (_, index) => image(`image-${index}`, `session-${index}`));
  let active = 0;
  let maxActive = 0;
  const inspection = await inspectCanvasUploadRecovery(elements, async (uploadSessionId) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    if (uploadSessionId === "session-4") throw new Error("offline");
    if (uploadSessionId === "session-0") return { uploadSession: { status: "failed" }, storageObject: { status: "available" } };
    if (uploadSessionId === "session-1") return { uploadSession: { status: "uploaded" }, storageObject: { status: "deleted" } };
    if (uploadSessionId === "session-2") return { uploadSession: { status: "expired" }, storageObject: { status: "available" } };
    if (uploadSessionId === "session-5") return { uploadSession: { status: "uploading" }, storageObject: { status: "pending_upload" } };
    return { uploadSession: { status: "uploaded" }, storageObject: { status: "available" } };
  }, { concurrency: 2 });

  assert.ok(maxActive <= 2);
  assert.deepEqual(new Set(inspection.checkedSessionIds), new Set(["session-0", "session-1", "session-2", "session-3", "session-5"]));
  assert.deepEqual(new Set(inspection.unavailableSessionIds), new Set(["session-0", "session-1", "session-2"]));

  const recovery = markCanvasUploadsForSourceRecovery(elements, inspection.unavailableSessionIds);
  assert.equal(recovery.changed, true);
  assert.deepEqual(recovery.elementIds, ["image-0", "image-1", "image-2"]);
  for (const element of recovery.elements.slice(0, 3)) {
    assert.equal(element.customData.cloudArchiveStatus, "failed");
    assert.equal(element.customData.archiveRetryState, "needs-file");
    assert.equal(element.customData.requiresSourceFile, true);
    assert.equal(element.version, 2);
  }
  assert.equal(recovery.elements[3], elements[3]);
  assert.equal(recovery.elements[4], elements[4]);
  assert.equal(recovery.elements[5], elements[5]);
});

test("canvas hydration wires upload status preflight into the normal save path", async () => {
  const [editor, main, creatorApi] = await Promise.all([
    readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/shared/creator-api.js", import.meta.url), "utf8"),
  ]);

  assert.match(creatorApi, /getUploadSession\(uploadSessionId\)/);
  assert.match(creatorApi, /\/api\/storage\/upload-sessions\/\$\{encodeURIComponent\(uploadSessionId\)\}/);
  assert.match(main, /creatorApi\.getUploadSession\(uploadSessionId\)/);
  assert.match(main, /onCheckUploadSession=\{checkCanvasUploadSession\}/);
  assert.match(editor, /inspectCanvasUploadRecovery\(result\.elements, onCheckUploadSession\)/);
  assert.match(editor, /markCanvasUploadsForSourceRecovery/);
  assert.match(editor, /captureUpdate: "IMMEDIATELY"/);
});
