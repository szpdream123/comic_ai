import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANONICAL_WORKFLOW_NODE_PORTS,
  CanvasValidationError,
  validateCanonicalWorkflowDocumentGraph,
  validateCanvasDocumentGraph,
} from "../creator-canvas-validation.ts";

function documentWith(edge = {
  id: "edge-1",
  sourceNodeId: "script-1",
  sourcePortId: "out-text",
  targetNodeId: "image-1",
  targetPortId: "in-text",
}) {
  return {
    nodes: [
      {
        id: "script-1",
        data: {
          ports: {
            inputs: [{ id: "in-text", kind: "text" }],
            outputs: [{ id: "out-text", kind: "text" }],
          },
        },
      },
      {
        id: "image-1",
        data: {
          ports: {
            inputs: [{ id: "in-text", kind: "text" }],
            outputs: [{ id: "out-image", kind: "image" }],
          },
        },
      },
    ],
    edges: [edge],
  };
}

function assertCanvasError(fn: () => void, code: string) {
  assert.throws(
    fn,
    (error) => error instanceof CanvasValidationError && error.code === code,
  );
}

describe("creator canvas validation", () => {
  it("allows the canonical composition output to feed a video node", () => {
    assert.deepEqual(CANONICAL_WORKFLOW_NODE_PORTS.output.outputs, [{ id: "out_video", kind: "video" }]);
    assert.doesNotThrow(() => validateCanonicalWorkflowDocumentGraph({
      nodes: [
        { id: "composition", type: "output", data: { ports: CANONICAL_WORKFLOW_NODE_PORTS.output } },
        { id: "video", type: "video", data: { ports: CANONICAL_WORKFLOW_NODE_PORTS.video } },
      ],
      edges: [{ id: "edge", sourceNodeId: "composition", sourcePortId: "out_video", targetNodeId: "video", targetPortId: "in_asset", data: { kind: "video" } }],
    }));
  });

  it("allows matching output to input connections", () => {
    assert.doesNotThrow(() => validateCanvasDocumentGraph(documentWith()));
  });

  it("allows image and video nodes to receive their supported media kinds", () => {
    const document = documentWith({
      id: "edge-1",
      sourceNodeId: "script-1",
      sourcePortId: "out-text",
      targetNodeId: "image-1",
      targetPortId: "in-image",
    });
    document.nodes[1] = {
      id: "image-1",
      type: "image",
      data: {
        ports: {
          inputs: [{ id: "in-image", kind: "image" }],
          outputs: [{ id: "out-image", kind: "image" }],
        },
      },
    };

    assert.doesNotThrow(() => validateCanvasDocumentGraph(document));

    document.nodes[0] = {
      id: "audio-1",
      data: { ports: { inputs: [], outputs: [{ id: "out-audio", kind: "audio" }] } },
    };
    document.nodes[1] = {
      id: "video-1",
      type: "video",
      data: {
        ports: {
          inputs: [{ id: "in-image", kind: "image" }],
          outputs: [{ id: "out-video", kind: "video" }],
        },
      },
    };
    document.edges[0] = {
      id: "edge-1",
      sourceNodeId: "audio-1",
      sourcePortId: "out-audio",
      targetNodeId: "video-1",
      targetPortId: "in-image",
    };

    assert.doesNotThrow(() => validateCanvasDocumentGraph(document));
  });

  it("rejects missing source or target nodes", () => {
    assertCanvasError(
      () => validateCanvasDocumentGraph(documentWith({
        id: "edge-1",
        sourceNodeId: "missing",
        sourcePortId: "out-text",
        targetNodeId: "image-1",
        targetPortId: "in-text",
      })),
      "canvas_connection_source_missing",
    );
    assertCanvasError(
      () => validateCanvasDocumentGraph(documentWith({
        id: "edge-1",
        sourceNodeId: "script-1",
        sourcePortId: "out-text",
        targetNodeId: "missing",
        targetPortId: "in-text",
      })),
      "canvas_connection_target_missing",
    );
  });

  it("rejects missing ports and invalid directions", () => {
    assertCanvasError(
      () => validateCanvasDocumentGraph(documentWith({
        id: "edge-1",
        sourceNodeId: "script-1",
        sourcePortId: "missing",
        targetNodeId: "image-1",
        targetPortId: "in-text",
      })),
      "canvas_connection_port_missing",
    );
    assertCanvasError(
      () => validateCanvasDocumentGraph(documentWith({
        id: "edge-1",
        sourceNodeId: "script-1",
        sourcePortId: "in-text",
        targetNodeId: "image-1",
        targetPortId: "out-image",
      })),
      "canvas_connection_direction_invalid",
    );
  });

  it("rejects media kind mismatch, self-links, and cycles", () => {
    assertCanvasError(
      () => validateCanvasDocumentGraph(documentWith({
        id: "edge-1",
        sourceNodeId: "image-1",
        sourcePortId: "out-image",
        targetNodeId: "script-1",
        targetPortId: "in-text",
      })),
      "canvas_connection_kind_mismatch",
    );
    assertCanvasError(
      () => validateCanvasDocumentGraph(documentWith({
        id: "edge-1",
        sourceNodeId: "script-1",
        sourcePortId: "out-text",
        targetNodeId: "script-1",
        targetPortId: "in-text",
      })),
      "canvas_connection_self_link",
    );
    assertCanvasError(
      () => validateCanvasDocumentGraph({
        nodes: [
          {
            id: "a",
            data: {
              ports: {
                inputs: [{ id: "in", kind: "text" }],
                outputs: [{ id: "out", kind: "text" }],
              },
            },
          },
          {
            id: "b",
            data: {
              ports: {
                inputs: [{ id: "in", kind: "text" }],
                outputs: [{ id: "out", kind: "text" }],
              },
            },
          },
        ],
        edges: [
          { id: "edge-1", sourceNodeId: "a", sourcePortId: "out", targetNodeId: "b", targetPortId: "in" },
          { id: "edge-2", sourceNodeId: "b", sourcePortId: "out", targetNodeId: "a", targetPortId: "in" },
        ],
      }),
      "canvas_connection_cycle",
    );
  });
});
