import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureCanvasAgentState,
  normalizeAgentMediaTask,
  reduceCanvasAgentEvents,
  renderCanvasAgentPanel,
} from "../src/features/new-canvas/canvas-agent-panel.js";
import { reconcileCanvasMediaDocumentSources } from "../src/features/production-workbench/canvas/canvas-media-node.js";

test("Canvas Agent pressure gate bounds long event sessions and rendered timeline", () => {
  const ui = {};
  const agent = ensureCanvasAgentState(ui);
  agent.taskId = "pressure-task";

  const events = Array.from({ length: 2_000 }, (_, index) => ({
    id: `event-${index + 1}`,
    sequence: index + 1,
    eventType: index === 1_999 ? "task.succeeded" : "step.succeeded",
    event: { stepId: `step-${index + 1}`, toolId: "canvas.read" },
  }));
  const startedAt = performance.now();
  reduceCanvasAgentEvents(agent, events);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(agent.events.length, 500);
  assert.equal(agent.events[0].sequence, 1_501);
  assert.equal(agent.events.at(-1).sequence, 2_000);
  assert.equal(agent.sequence, 2_000);
  assert.equal(agent.status, "succeeded");
  assert.ok(elapsedMs < 1_000, `event reduction took ${elapsedMs.toFixed(1)}ms`);

  agent.messages = Array.from({ length: 1_000 }, (_, index) => ({
    id: `message-${index + 1}`,
    role: index % 2 ? "assistant" : "user",
    text: `message-${index + 1}`,
  }));
  const html = renderCanvasAgentPanel(ui);
  assert.equal((html.match(/class="canvas-agent-event"/g) ?? []).length, 40);
  assert.match(html, /message-1000/);
  assert.doesNotMatch(html, /message-1<\/p>/);
});

test("Canvas Agent pressure gate rejects large Base64 media before HTML rendering", () => {
  const oversizedDataUrl = `data:image/png;base64,${"A".repeat(2 * 1024 * 1024)}`;
  const media = normalizeAgentMediaTask({
    taskId: "large-inline-media",
    kind: "image",
    status: "completed",
    result: { imageUrl: oversizedDataUrl },
  });
  assert.equal(media.url, "");

  const html = renderCanvasAgentPanel({
    canvasAgent: {
      messages: [{
        id: "large-inline-message",
        role: "assistant",
        text: "大图结果",
        media,
      }],
    },
  });
  assert.doesNotMatch(html, /data:image\/png;base64/);
  assert.equal(html.includes(oversizedDataUrl), false);
});

test("Canvas media pressure gate reconciles 2,000 stable IDs within a bounded result", () => {
  const count = 2_000;
  const document = {
    version: 1,
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `audio-${index}`,
      type: "source-audio",
      data: { assetVersionId: `version-${index}` },
    })),
    edges: [],
  };
  const assets = Array.from({ length: count }, (_, index) => ({
    assetVersionId: `version-${index}`,
    storageObjectId: `storage-${index}`,
  }));

  const startedAt = performance.now();
  const reconciled = reconcileCanvasMediaDocumentSources(document, assets);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.document.nodes.length, count);
  assert.equal(reconciled.document.nodes[0].data.storageObjectId, "storage-0");
  assert.equal(reconciled.document.nodes.at(-1).data.storageObjectId, `storage-${count - 1}`);
  assert.equal(document.nodes[0].data.storageObjectId, undefined);
  assert.ok(elapsedMs < 1_000, `media reconciliation took ${elapsedMs.toFixed(1)}ms`);
});
