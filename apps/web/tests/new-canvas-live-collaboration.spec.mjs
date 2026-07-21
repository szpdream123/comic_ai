import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canvasContentToDocument,
  createCloudCanvasStorage,
} from "../new-canvas/src/loomic-core/canvas-document-adapter.js";
import { parseCanvasLiveSseMessage } from "../new-canvas/src/loomic-core/canvas-live-client.js";

const CANVAS_ID = "8a6d604a-a1b7-4a10-8aef-dcfcd91902cb";

describe("new canvas live collaboration", () => {
  it("parses authenticated SSE data events and rejects malformed chunks", () => {
    assert.deepEqual(
      parseCanvasLiveSseMessage('data: {"type":"revision","serverRevision":3}\n\n'),
      { type: "revision", serverRevision: 3 },
    );
    assert.equal(parseCanvasLiveSseMessage("event: ping\n\n"), null);
    assert.equal(parseCanvasLiveSseMessage("data: invalid-json\n\n"), null);
  });

  it("subscribes to the concrete canvas channel and notifies only for newer revisions", async () => {
    const content = {
      elements: [],
      appState: { viewBackgroundColor: "#ffffff", gridModeEnabled: false },
      files: {},
    };
    const document = canvasContentToDocument(content, {
      canvasProjectId: CANVAS_ID,
      projectId: CANVAS_ID,
      now: () => "2026-07-20T00:00:00.000Z",
    });
    let liveCanvasProjectId = "";
    let liveListener = null;
    let unsubscribeCount = 0;
    const storage = createCloudCanvasStorage({
      projectId: CANVAS_ID,
      localStore: {
        async load() { return content; },
        async save() { return undefined; },
        async remove() { return undefined; },
      },
      creatorApi: {
        async getStandaloneCanvas() {
          return { canvas: { canvasProjectId: CANVAS_ID, serverRevision: 1, document } };
        },
      },
      subscribeLive(canvasProjectId, listener) {
        liveCanvasProjectId = canvasProjectId;
        liveListener = listener;
        return () => { unsubscribeCount += 1; };
      },
    });

    await storage.initialize();
    const revisions = [];
    const unsubscribe = storage.subscribeRemoteUpdates((event) => revisions.push(event.serverRevision));
    assert.equal(liveCanvasProjectId, CANVAS_ID);
    assert.equal(typeof liveListener, "function");

    liveListener({ type: "presence", members: [] });
    liveListener({ type: "revision", serverRevision: 1 });
    liveListener({ type: "revision", serverRevision: 2 });
    assert.deepEqual(revisions, [2]);

    unsubscribe();
    assert.equal(unsubscribeCount, 1);
  });
});
