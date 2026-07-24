import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CanvasVideoCompositionValidationError,
  resolveCanvasVideoCompositionRequest,
} from "../canvas-video-composition.service.ts";

const imageObjectId = "10000000-0000-4000-8000-000000000001";
const videoObjectId = "10000000-0000-4000-8000-000000000002";

function compositionSignature(clips: Array<Record<string, unknown>> = []) {
  return JSON.stringify({
    width: 1280,
    height: 720,
    fps: 24,
    imageDurationSeconds: 3,
    clips,
  });
}

function node(
  id: string,
  type: string,
  element: Record<string, unknown>,
  ports: Record<string, unknown>,
) {
  return { id, type, data: { loomicElement: element, ports } };
}

function document() {
  return {
    nodes: [
      node("image-1", "upload", { type: "image", customData: { storageObjectId: imageObjectId } }, { inputs: [], outputs: [{ id: "out_image", kind: "image" }] }),
      node("video-1", "video-upload", { type: "embeddable", customData: { isVideo: true, mediaKind: "video", durationSeconds: 4, storageObjectId: videoObjectId } }, { inputs: [], outputs: [{ id: "out_video", kind: "video" }] }),
      node("output-1", "output", { type: "rectangle", customData: { type: "video-composition-node", mediaKind: "video" } }, { inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [] }),
      node("audio-1", "audio-upload", { type: "rectangle", customData: { type: "audio-node", mediaKind: "audio", storageObjectId: "10000000-0000-4000-8000-000000000003" } }, { inputs: [], outputs: [{ id: "out_audio", kind: "audio" }] }),
    ],
    edges: [
      { sourceNodeId: "image-1", sourcePortId: "out_image", targetNodeId: "output-1", targetPortId: "in_media", data: { kind: "image" } },
      { sourceNodeId: "video-1", sourcePortId: "out_video", targetNodeId: "output-1", targetPortId: "in_media", data: { kind: "video" } },
      { sourceNodeId: "audio-1", sourcePortId: "out_audio", targetNodeId: "output-1", targetPortId: "in_media", data: { kind: "audio" } },
    ],
  };
}

describe("canvas video composition request", () => {
  it("derives archived connected image and video clips in explicit order", () => {
    const result = resolveCanvasVideoCompositionRequest(document(), {
      nodeId: "output-1",
      width: 1920,
      height: 1080,
      fps: 24,
      clips: [
        { nodeId: "video-1", durationSeconds: 2.5 },
        { nodeId: "image-1", durationSeconds: 1.25 },
      ],
    });
    assert.deepEqual(result, {
      nodeId: "output-1",
      width: 1920,
      height: 1080,
      fps: 24,
      clips: [
        { nodeId: "video-1", kind: "video", storageObjectId: videoObjectId, durationSeconds: 2.5 },
        { nodeId: "image-1", kind: "image", storageObjectId: imageObjectId, durationSeconds: 1.25 },
      ],
    });
  });

  it("accepts a composition result object and falls back from an empty result id", () => {
    const chained = document();
    chained.nodes.splice(2, 0, node(
      "composition-source",
      "output",
      { type: "rectangle", customData: { type: "video-composition-node", mediaKind: "video", status: "completed", inputUpdated: false, resultMimeType: "video/mp4", compositionInputSignature: compositionSignature(), resultStorageObjectId: videoObjectId, storageObjectId: imageObjectId } },
      { inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [{ id: "out_video", kind: "video" }] },
    ));
    chained.edges.push({ sourceNodeId: "composition-source", sourcePortId: "out_video", targetNodeId: "output-1", targetPortId: "in_media", data: { kind: "video" } });
    assert.equal(resolveCanvasVideoCompositionRequest(chained, {
      nodeId: "output-1",
      clips: [{ nodeId: "composition-source" }],
    }).clips[0].storageObjectId, videoObjectId);

    const customData = (chained.nodes[2].data.loomicElement as { customData: Record<string, unknown> }).customData;
    customData.resultStorageObjectId = "";
    assert.equal(resolveCanvasVideoCompositionRequest(chained, {
      nodeId: "output-1",
      clips: [{ nodeId: "composition-source" }],
    }).clips[0].storageObjectId, imageObjectId);
  });

  it("rejects a completed composition result after its connected inputs change", () => {
    const chained = document();
    chained.nodes.splice(2, 0, node(
      "composition-source",
      "output",
      { type: "rectangle", customData: { type: "video-composition-node", mediaKind: "video", status: "completed", inputUpdated: false, resultMimeType: "video/mp4", compositionInputSignature: compositionSignature([{ nodeId: "image-1", kind: "image", storageObjectId: imageObjectId, durationSeconds: 3 }]), resultStorageObjectId: videoObjectId } },
      { inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [{ id: "out_video", kind: "video" }] },
    ));
    chained.edges.push(
      { sourceNodeId: "image-1", sourcePortId: "out_image", targetNodeId: "composition-source", targetPortId: "in_media", data: { kind: "image" } },
      { sourceNodeId: "composition-source", sourcePortId: "out_video", targetNodeId: "output-1", targetPortId: "in_media", data: { kind: "video" } },
    );
    const customData = (chained.nodes[2].data.loomicElement as { customData: Record<string, unknown> }).customData;
    customData.clipDurations = { "image-1": 4 };

    assert.throws(
      () => resolveCanvasVideoCompositionRequest(chained, { nodeId: "output-1", clips: [{ nodeId: "composition-source" }] }),
      (error: unknown) => error instanceof CanvasVideoCompositionValidationError && error.code === "canvas_video_composition_clip_stale",
    );
  });

  it("rejects an incomplete, stale, or unverified composition source", () => {
    for (const updates of [
      { status: "running" },
      { inputUpdated: true },
      { compositionInputSignature: "" },
    ]) {
      const chained = document();
      chained.nodes.splice(2, 0, node(
        "composition-source",
        "output",
        { type: "rectangle", customData: { type: "video-composition-node", mediaKind: "video", status: "completed", inputUpdated: false, resultMimeType: "video/mp4", compositionInputSignature: "signature", resultStorageObjectId: videoObjectId, ...updates } },
        { inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [{ id: "out_video", kind: "video" }] },
      ));
      chained.edges.push({ sourceNodeId: "composition-source", sourcePortId: "out_video", targetNodeId: "output-1", targetPortId: "in_media", data: { kind: "video" } });
      assert.throws(
        () => resolveCanvasVideoCompositionRequest(chained, { nodeId: "output-1", clips: [{ nodeId: "composition-source" }] }),
        (error: unknown) => error instanceof CanvasVideoCompositionValidationError && error.code === "canvas_video_composition_clip_stale",
      );
    }
  });

  it("rejects disconnected, non-media, duplicate, and unarchived clips", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ nodeId: "output-1", clips: [{ nodeId: "missing" }] }, "canvas_video_composition_clip_not_connected"],
      [{ nodeId: "output-1", clips: [{ nodeId: "audio-1" }] }, "canvas_video_composition_clip_type_invalid"],
      [{ nodeId: "output-1", clips: [{ nodeId: "image-1" }, { nodeId: "image-1" }] }, "canvas_video_composition_clip_duplicate"],
    ];
    const unarchived = document();
    (unarchived.nodes[0].data.loomicElement as { customData: Record<string, unknown> }).customData.storageObjectId = "";
    for (const [input, code] of cases) {
      assert.throws(
        () => resolveCanvasVideoCompositionRequest(document(), input as never),
        (error: unknown) => error instanceof CanvasVideoCompositionValidationError && error.code === code,
      );
    }
    assert.throws(
      () => resolveCanvasVideoCompositionRequest(unarchived, { nodeId: "output-1", clips: [{ nodeId: "image-1" }] }),
      (error: unknown) => error instanceof CanvasVideoCompositionValidationError && error.code === "canvas_video_composition_clip_not_archived",
    );
  });

  it("rejects connections with the wrong target port, source port, or edge kind", () => {
    const cases = [
      { field: "targetPortId", value: "in_other" },
      { field: "sourcePortId", value: "out_video" },
      { field: "kind", value: "video" },
    ] as const;
    for (const testCase of cases) {
      const invalid = document();
      const edge = invalid.edges[0] as Record<string, unknown>;
      if (testCase.field === "kind") {
        edge.data = { kind: testCase.value };
      } else {
        edge[testCase.field] = testCase.value;
      }
      assert.throws(
        () => resolveCanvasVideoCompositionRequest(invalid, { nodeId: "output-1", clips: [{ nodeId: "image-1" }] }),
        (error: unknown) => error instanceof CanvasVideoCompositionValidationError && error.code === "canvas_video_composition_clip_not_connected",
      );
    }
  });

  it("rejects a target input that does not accept the source media kind", () => {
    const invalid = document();
    const targetPorts = invalid.nodes[2].data.ports as { inputs: Array<Record<string, unknown>> };
    targetPorts.inputs[0].accepts = ["video"];
    assert.throws(
      () => resolveCanvasVideoCompositionRequest(invalid, { nodeId: "output-1", clips: [{ nodeId: "image-1" }] }),
      (error: unknown) => error instanceof CanvasVideoCompositionValidationError && error.code === "canvas_video_composition_clip_not_connected",
    );
  });
});
