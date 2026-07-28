import { afterEach, expect, it } from "vitest";
// The integrated Canvas host is JavaScript-only and has no declaration file.
// @ts-expect-error The test intentionally exercises the existing JS host boundary.
import { appendCanvasDirectorCapture } from "../../../../new-canvas/director-desk-overlay.js";
import {
  clearDirectorDeskCaptureHandler,
  clearDirectorDeskVideoHandler,
  postDirectorDeskCapturesToHost,
  postDirectorDeskVideoToHost,
  setDirectorDeskCaptureHandler,
  setDirectorDeskVideoHandler,
} from "./hostBridge";

afterEach(() => {
  clearDirectorDeskCaptureHandler();
  clearDirectorDeskVideoHandler();
});

it("hands screenshot and reference video bridge outputs back as Canvas Artifacts", async () => {
  const calls: Array<{ kind: string; value: unknown }> = [];
  const originalDocument = {
    version: 2,
    canvasProjectId: "canvas-director",
    nodes: [{
      id: "director-node",
      type: "ai-director",
      data: { directorDeskKey: "desk-1" } as Record<string, unknown>,
    }],
    edges: [],
  };
  let storageIndex = 0;
  const workbench = {
    api: {
      async uploadFile(file: File, options: Record<string, unknown>) {
        const storageObjectId = `storage-${++storageIndex}`;
        calls.push({ kind: "upload", value: { file, options, storageObjectId } });
        return { upload: { storageObjectId } };
      },
      async appendCanvasDirectorArtifact(
        canvasProjectId: string,
        nodeKey: string,
        input: Record<string, unknown>,
      ) {
        const artifactId = `artifact-${storageIndex}`;
        calls.push({ kind: "append", value: { canvasProjectId, nodeKey, input, artifactId } });
        return { artifact: { id: artifactId } };
      },
    },
    ui: {
      selectedCanvasProjectId: "canvas-director",
      canvasServerRevision: 7,
      canvasDocument: originalDocument,
      canvasDocumentsByProject: { "canvas-director": originalDocument },
    },
    updateCanvasDocument(nextDocument: unknown) {
      calls.push({ kind: "update", value: nextDocument });
    },
    async saveCanvasNow() {
      calls.push({ kind: "save", value: this.ui.canvasDocument });
      return { canvasProjectId: "canvas-director", serverRevision: 8 };
    },
  };
  const handoffs: Promise<unknown>[] = [];

  setDirectorDeskCaptureHandler((captures) => {
    const capture = captures[0];
    const handoff = appendCanvasDirectorCapture(
      workbench,
      originalDocument.nodes[0],
      new File(["screenshot"], capture.fileName, { type: "image/png" }),
      { directorArtifactKind: "screenshot" },
    );
    handoffs.push(handoff);
    return handoff;
  });
  setDirectorDeskVideoHandler((file) => {
    const handoff = appendCanvasDirectorCapture(workbench, originalDocument.nodes[0], file, {
      directorArtifactKind: "video",
      media: "reference-video",
    });
    handoffs.push(handoff);
    return handoff;
  });

  postDirectorDeskCapturesToHost([{
    dataUrl: "data:image/png;base64,YQ==",
    fileName: "shot.png",
  }]);
  await Promise.all(handoffs);
  expect(postDirectorDeskVideoToHost(
    new Blob(["video"], { type: "video/webm" }),
    "reference.webm",
  )).toBe(true);
  await Promise.all(handoffs);

  expect(calls.map(({ kind }) => kind)).toEqual([
    "upload", "append", "update", "save",
    "upload", "append", "update", "save",
  ]);
  expect((calls[1].value as { input: Record<string, any> }).input).toMatchObject({
    storageObjectId: "storage-1",
    artifactKind: "image",
    metadata: { source: "director-desk", directorArtifactKind: "screenshot" },
  });
  expect((calls[5].value as { input: Record<string, any> }).input).toMatchObject({
    storageObjectId: "storage-2",
    artifactKind: "video",
    metadata: { source: "director-desk", directorArtifactKind: "video", media: "reference-video" },
  });
  expect(workbench.ui.canvasDocument.nodes[0].data).toMatchObject({
    artifactId: "artifact-2",
    storageObjectId: "storage-2",
    assetVersionId: null,
    status: "success",
  });
  expect(JSON.stringify(workbench.ui.canvasDocument)).not.toMatch(/data:image|blob:|https?:/);
  expect(originalDocument.nodes[0].data.artifactId).toBeUndefined();
});
