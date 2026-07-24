import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasWorkflowNodeType,
  canvasWorkflowPorts,
  collectCanvasWorkflowEdges,
  findCanvasWorkflowDependencyCycle,
  markCanvasDrawingArrowsNonWorkflow,
  migrateLegacyCanvasWorkflowEdges,
  wouldCreateCanvasWorkflowCycle,
} from "../new-canvas/src/loomic-core/canvas-workflow-edges.js";
import {
  collectCanvasGenerationDependencyFingerprints,
  markChangedCanvasGenerationDependencies,
} from "../new-canvas/src/loomic-core/canvas-generation-dependencies.js";

function arrow(id, sourceNodeId, targetNodeId, customData) {
  return {
    id,
    type: "arrow",
    startBinding: sourceNodeId ? { elementId: sourceNodeId } : null,
    endBinding: targetNodeId ? { elementId: targetNodeId } : null,
    ...(customData ? { customData } : {}),
  };
}

test("new canvas workflow rules share semantic node types and typed ports", () => {
  assert.equal(canvasWorkflowNodeType({ type: "text" }), "script");
  assert.equal(canvasWorkflowNodeType({ type: "image" }), "upload");
  assert.equal(canvasWorkflowNodeType({ type: "rectangle", customData: { type: "image-generator" } }), "image");
  assert.equal(canvasWorkflowNodeType({ type: "rectangle", customData: { type: "video-generator" } }), "video");
  assert.deepEqual(canvasWorkflowPorts("script").outputs, [{ id: "out_text", kind: "text" }]);
  assert.deepEqual(canvasWorkflowPorts("image").inputs[0].accepts, ["text", "image"]);
  assert.deepEqual(canvasWorkflowPorts("video").inputs[0].accepts, ["text", "image", "video", "audio"]);
  assert.equal(canvasWorkflowNodeType({ type: "embeddable", customData: { isVideo: true, sourceKind: "upload" } }), "video-upload");
  assert.equal(canvasWorkflowNodeType({ type: "rectangle", customData: { type: "audio-node", sourceKind: "upload" } }), "audio-upload");
  assert.deepEqual(canvasWorkflowPorts("video-upload"), { inputs: [], outputs: [{ id: "out_video", kind: "video" }] });
  assert.deepEqual(canvasWorkflowPorts("audio-upload"), { inputs: [], outputs: [{ id: "out_audio", kind: "audio" }] });
});

test("uploaded video and audio are source-only nodes while still feeding video generation", () => {
  const elements = [
    { id: "text", type: "text" },
    { id: "uploaded-video", type: "embeddable", customData: { isVideo: true, sourceKind: "upload" } },
    { id: "uploaded-audio", type: "rectangle", customData: { type: "audio-node", sourceKind: "upload" } },
    { id: "video-generator", type: "rectangle", customData: { type: "video-generator" } },
    arrow("invalid-text-upload", "text", "uploaded-video", { workflowEdge: true }),
    arrow("video-input", "uploaded-video", "video-generator", { workflowEdge: true }),
    arrow("audio-input", "uploaded-audio", "video-generator", { workflowEdge: true }),
  ];

  assert.deepEqual(collectCanvasWorkflowEdges(elements).map((edge) => edge.id), [
    "video-input:workflow-edge",
    "audio-input:workflow-edge",
  ]);
});

test("legacy hydration migrates compatible arrows once while collection requires explicit workflow edges", () => {
  const elements = [
    { id: "text", type: "text" },
    { id: "image", type: "rectangle", customData: { type: "image-generator" } },
    { id: "video", type: "rectangle", customData: { type: "video-generator" } },
    arrow("legacy-text-image", "text", "image"),
    arrow("explicit-image-video", "image", "video", { workflowEdge: true }),
  ];

  assert.deepEqual(collectCanvasWorkflowEdges(elements).map((edge) => edge.id), [
    "explicit-image-video:workflow-edge",
  ]);
  const migrated = migrateLegacyCanvasWorkflowEdges(elements);
  assert.equal(migrated.find((element) => element.id === "legacy-text-image").customData.workflowEdge, true);
  assert.strictEqual(migrateLegacyCanvasWorkflowEdges(migrated), migrated);
  assert.deepEqual(collectCanvasWorkflowEdges(migrated), [
    {
      id: "legacy-text-image:workflow-edge",
      sourceNodeId: "text",
      sourcePortId: "out_text",
      targetNodeId: "image",
      targetPortId: "in_asset",
      data: { kind: "text" },
    },
    {
      id: "explicit-image-video:workflow-edge",
      sourceNodeId: "image",
      sourcePortId: "out_image",
      targetNodeId: "video",
      targetPortId: "in_asset",
      data: { kind: "image" },
    },
  ]);
});

test("ordinary drawing arrows are marked non-workflow before planning while port edges stay executable", () => {
  const elements = [
    { id: "text", type: "text" },
    { id: "image", type: "rectangle", customData: { type: "image-generator" } },
    arrow("ordinary-arrow", "text", "image"),
    arrow("port-arrow", "text", "image", { workflowEdge: true }),
  ];

  let scene = elements;
  let updateCount = 0;
  const applyDrawingArrowGuard = () => {
    const next = markCanvasDrawingArrowsNonWorkflow(scene);
    if (next !== scene) {
      updateCount += 1;
      scene = next;
    }
  };
  applyDrawingArrowGuard();
  assert.equal(updateCount, 1);
  assert.equal(scene.find((element) => element.id === "ordinary-arrow").customData.workflowEdge, false);
  assert.equal(scene.find((element) => element.id === "ordinary-arrow").version, 2);
  assert.equal(scene.find((element) => element.id === "port-arrow").customData.workflowEdge, true);
  assert.deepEqual(collectCanvasWorkflowEdges(scene).map((edge) => edge.id), ["port-arrow:workflow-edge"]);
  applyDrawingArrowGuard();
  assert.equal(updateCount, 1);
  assert.equal(scene.find((element) => element.id === "ordinary-arrow").version, 2);

  const explicit = [
    arrow("explicit-workflow", "text", "image", { workflowEdge: true }),
    arrow("explicit-visual", "text", "image", { workflowEdge: false }),
  ];
  assert.strictEqual(markCanvasDrawingArrowsNonWorkflow(explicit), explicit);
});

test("new canvas workflow rules keep only one edge for the same typed port pair", () => {
  const elements = [
    { id: "script", type: "text", text: "雨夜" },
    { id: "image", type: "rectangle", customData: { type: "image-generator" } },
    arrow("first", "script", "image", { workflowEdge: true }),
    arrow("duplicate", "script", "image", { workflowEdge: true }),
  ];
  assert.deepEqual(collectCanvasWorkflowEdges(elements).map((edge) => edge.id), ["first:workflow-edge"]);
  assert.deepEqual(
    collectCanvasGenerationDependencyFingerprints(elements),
    collectCanvasGenerationDependencyFingerprints(elements.filter((element) => element.id !== "duplicate")),
  );
});

test("new canvas workflow rules reject visual, self, reversed, and mismatched arrows", () => {
  const elements = [
    { id: "text", type: "text" },
    { id: "image", type: "rectangle", customData: { type: "image-generator" } },
    { id: "video", type: "rectangle", customData: { type: "video-generator" } },
    arrow("visual-unbound", null, null),
    arrow("visual-disabled", "text", "image", { workflowEdge: false }),
    arrow("self", "image", "image"),
    arrow("reversed", "image", "text", { workflowEdge: true }),
    arrow("mismatch", "video", "image", { workflowEdge: true }),
  ];

  assert.deepEqual(collectCanvasWorkflowEdges(elements), []);
});

test("new canvas workflow rules detect and reject cycles", () => {
  const firstEdge = {
    sourceNodeId: "image-a",
    targetNodeId: "image-b",
  };
  assert.equal(wouldCreateCanvasWorkflowCycle([firstEdge], "image-b", "image-a"), true);
  assert.equal(wouldCreateCanvasWorkflowCycle([firstEdge], "image-b", "image-c"), false);
  assert.equal(wouldCreateCanvasWorkflowCycle([], "image-a", "image-a"), true);

  const elements = [
    { id: "image-a", type: "rectangle", customData: { type: "image-generator" } },
    { id: "image-b", type: "rectangle", customData: { type: "image-generator" } },
    arrow("forward", "image-a", "image-b", { workflowEdge: true }),
    arrow("cycle", "image-b", "image-a", { workflowEdge: true }),
  ];
  assert.deepEqual(collectCanvasWorkflowEdges(elements).map((edge) => edge.id), ["forward:workflow-edge"]);
  assert.deepEqual(findCanvasWorkflowDependencyCycle(elements), {
    nodeIds: ["image-a", "image-b", "image-a"],
    edgeIds: ["forward:workflow-edge", "cycle:workflow-edge"],
  });
});

test("dependency cycle audit ignores non-executable visual and mismatched arrows", () => {
  const elements = [
    { id: "script", type: "text" },
    { id: "image", type: "rectangle", customData: { type: "image-generator" } },
    { id: "video", type: "rectangle", customData: { type: "video-generator" } },
    arrow("script-image", "script", "image", { workflowEdge: true }),
    arrow("visual-disabled", "image", "script", { workflowEdge: false }),
    arrow("kind-mismatch", "video", "image", { workflowEdge: true }),
  ];
  assert.equal(findCanvasWorkflowDependencyCycle(elements), null);
});

test("upstream content and connection changes mark completed generators without reacting to movement", () => {
  const source = { id: "script", type: "text", text: "雨夜", x: 0, y: 0, version: 1 };
  const target = { id: "image", type: "rectangle", customData: { type: "image-generator", status: "completed", resultUrl: "/shot.png", inputUpdated: false } };
  const connection = arrow("script-image", "script", "image", { workflowEdge: true });
  const baselineElements = [source, target, connection];
  const baseline = collectCanvasGenerationDependencyFingerprints(baselineElements);

  const moved = markChangedCanvasGenerationDependencies([{ ...source, x: 500, version: 2 }, target, connection], baseline);
  assert.deepEqual(moved.changedIds, []);
  assert.strictEqual(moved.elements[1], target);

  const edited = markChangedCanvasGenerationDependencies([{ ...source, text: "雪夜", version: 2 }, target, connection], baseline);
  assert.deepEqual(edited.changedIds, ["image"]);
  assert.equal(edited.elements[1].customData.inputUpdated, true);

  const disconnected = markChangedCanvasGenerationDependencies([source, target, { ...connection, isDeleted: true }], baseline);
  assert.deepEqual(disconnected.changedIds, ["image"]);
  assert.equal(disconnected.elements[1].customData.inputUpdated, true);
});

test("composition dependency tracking preserves clip order and stable object identity", () => {
  const source = { id: "source", type: "embeddable", x: 0, customData: { isVideo: true, mediaKind: "video", storageObjectId: "source-object" } };
  const composition = { id: "composition", type: "rectangle", customData: { type: "video-composition-node", status: "completed", resultUrl: "/composed.mp4", width: 1280, height: 720, fps: 24, imageDurationSeconds: 3, inputUpdated: false } };
  const connection = arrow("source-composition", "source", "composition", { workflowEdge: true });
  const baseline = collectCanvasGenerationDependencyFingerprints([source, composition, connection]);

  const moved = markChangedCanvasGenerationDependencies([{ ...source, x: 600 }, composition, connection], baseline);
  assert.deepEqual(moved.changedIds, []);

  const settingsChanged = markChangedCanvasGenerationDependencies([source, { ...composition, customData: { ...composition.customData, fps: 30 } }, connection], baseline);
  assert.deepEqual(settingsChanged.changedIds, ["composition"]);
  assert.equal(settingsChanged.elements.find((element) => element.id === "composition").customData.inputUpdated, true);

  const sourceChanged = markChangedCanvasGenerationDependencies([{ ...source, customData: { ...source.customData, storageObjectId: "new-source-object" } }, composition, connection], baseline);
  assert.deepEqual(sourceChanged.changedIds, ["composition"]);
});

test("a composition becoming stale invalidates completed downstream generation", () => {
  const composition = { id: "composition", type: "rectangle", customData: { type: "video-composition-node", status: "completed", resultUrl: "/composed.mp4", resultStorageObjectId: "composition-object", compositionInputSignature: "signature", inputUpdated: false, mediaKind: "video" } };
  const target = { id: "target", type: "rectangle", customData: { type: "video-generator", status: "completed", resultUrl: "/next.mp4", inputUpdated: false } };
  const connection = arrow("composition-target", "composition", "target", { workflowEdge: true });
  const baseline = collectCanvasGenerationDependencyFingerprints([composition, target, connection]);
  const changed = markChangedCanvasGenerationDependencies([
    { ...composition, customData: { ...composition.customData, inputUpdated: true } },
    target,
    connection,
  ], baseline);
  assert.deepEqual(changed.changedIds, ["target"]);
  assert.equal(changed.elements.find((element) => element.id === "target").customData.inputUpdated, true);
});

test("source changes mark a completed director node input as updated", () => {
  const source = { id: "director-script", type: "text", text: "雨夜全景", x: 0, y: 0 };
  const director = {
    id: "director",
    type: "rectangle",
    customData: {
      type: "director-node",
      status: "completed",
      instructions: "设计镜头",
      directorResult: "先全景，再推进",
      inputUpdated: false,
    },
  };
  const connection = arrow("script-director", "director-script", "director", { workflowEdge: true });
  const baseline = collectCanvasGenerationDependencyFingerprints([source, director, connection]);
  const changed = markChangedCanvasGenerationDependencies([
    { ...source, text: "雪夜近景" },
    director,
    connection,
  ], baseline);

  assert.deepEqual(changed.changedIds, ["director"]);
  assert.equal(changed.elements.find((element) => element.id === "director").customData.inputUpdated, true);
});

test("director result, structured result, and stale fallback changes mark media generators", () => {
  const director = {
    id: "director-source",
    type: "rectangle",
    customData: {
      type: "director-node",
      status: "completed",
      instructions: "保持人物居中",
      directorResult: "低机位缓慢推进",
      directorStructuredResult: { shots: 1, movement: "push" },
      inputUpdated: false,
    },
  };
  const image = { id: "director-image", type: "rectangle", customData: { type: "image-generator", status: "completed", resultUrl: "/image.png", inputUpdated: false } };
  const video = { id: "director-video", type: "rectangle", customData: { type: "video-generator", status: "completed", resultUrl: "/video.mp4", inputUpdated: false } };
  const audio = { id: "director-audio", type: "rectangle", customData: { type: "audio-node", status: "completed", resultUrl: "/audio.mp3", inputUpdated: false } };
  const edges = [
    arrow("director-image-edge", "director-source", "director-image", { workflowEdge: true }),
    arrow("director-video-edge", "director-source", "director-video", { workflowEdge: true }),
    arrow("director-audio-edge", "director-source", "director-audio", { workflowEdge: true }),
  ];
  const elements = [director, image, video, audio, ...edges];
  const baseline = collectCanvasGenerationDependencyFingerprints(elements);
  const assertMediaUpdated = (nextDirector) => {
    const changed = markChangedCanvasGenerationDependencies([nextDirector, image, video, audio, ...edges], baseline);
    assert.deepEqual(changed.changedIds, ["director-image", "director-video", "director-audio"]);
    for (const id of changed.changedIds) {
      assert.equal(changed.elements.find((element) => element.id === id).customData.inputUpdated, true);
    }
  };

  assertMediaUpdated({
    ...director,
    customData: { ...director.customData, directorResult: "先环绕，再快速推进" },
  });
  assertMediaUpdated({
    ...director,
    customData: { ...director.customData, directorStructuredResult: { shots: 2, movement: "orbit" } },
  });
  assertMediaUpdated({
    ...director,
    customData: { ...director.customData, instructions: "改为人物侧逆光", inputUpdated: true },
  });
});
