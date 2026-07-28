import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { it } from "node:test";

import {
  CANVAS_DOCUMENT_LIMITS,
  validateCanvasDocumentEnvelope,
  validateCanvasDocumentGraph,
  validateCanvasDocumentProtocol,
} from "../creator-canvas-validation.ts";

it("validates the release-limit 2,000-node and 5,000-edge Canvas within the server budget", () => {
  const nodes = Array.from({ length: CANVAS_DOCUMENT_LIMITS.maximumNodes }, (_, index) => ({
    id: `node-${index}`,
    type: "ai-text",
    data: {
      title: `节点 ${index}`,
      ports: {
        inputs: [{ id: "in", kind: "text" }],
        outputs: [{ id: "out", kind: "text" }],
      },
    },
  }));
  const edges = Array.from({ length: CANVAS_DOCUMENT_LIMITS.maximumEdges }, (_, index) => ({
    id: `edge-${index}`,
    kind: "reference",
    sourceNodeId: `node-${index % nodes.length}`,
    sourcePortId: "out",
    targetNodeId: `node-${(index + 1) % nodes.length}`,
    targetPortId: "in",
  }));
  const document = { version: 2, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges };
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();

  validateCanvasDocumentEnvelope(document);
  validateCanvasDocumentProtocol(document);
  validateCanvasDocumentGraph(document);

  const durationMs = performance.now() - startedAt;
  const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  assert.ok(durationMs < 5_000, `Canvas limit validation took ${durationMs.toFixed(1)}ms`);
  assert.ok(heapGrowthBytes < 128 * 1024 * 1024, `Canvas limit validation grew heap by ${heapGrowthBytes} bytes`);
});
