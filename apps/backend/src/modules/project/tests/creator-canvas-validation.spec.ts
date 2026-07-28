import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANVAS_DOCUMENT_LIMITS,
  CANONICAL_WORKFLOW_NODE_PORTS,
  CanvasValidationError,
  validateCanonicalWorkflowDocumentGraph,
  validateCanvasDocumentEnvelope,
  validateCanvasDocumentGraph,
  validateCanvasDocumentProtocol,
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
  it("rejects documents that exceed structural and serialized limits", () => {
    assertCanvasError(
      () => validateCanvasDocumentEnvelope({
        nodes: Array.from({ length: CANVAS_DOCUMENT_LIMITS.maximumNodes + 1 }, (_, index) => ({ id: `node-${index}` })),
        edges: [],
      }),
      "canvas_node_limit_exceeded",
    );
    assertCanvasError(
      () => validateCanvasDocumentEnvelope({
        nodes: [],
        edges: Array.from({ length: CANVAS_DOCUMENT_LIMITS.maximumEdges + 1 }, (_, index) => ({ id: `edge-${index}` })),
      }),
      "canvas_edge_limit_exceeded",
    );
    assertCanvasError(
      () => validateCanvasDocumentEnvelope({ data: "x".repeat(CANVAS_DOCUMENT_LIMITS.maximumBytes) }),
      "canvas_document_too_large",
    );
  });

  it("rejects documents with excessive JSON nesting", () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let index = 0; index < CANVAS_DOCUMENT_LIMITS.maximumJsonDepth; index += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    assertCanvasError(
      () => validateCanvasDocumentEnvelope(root),
      "canvas_json_depth_exceeded",
    );
  });

  it("rejects ephemeral media, local paths, signed URLs, and secret fields in persisted documents", () => {
    for (const data of [
      { previewUrl: "data:image/png;base64,AAAA" },
      { mediaUrl: "blob:http://127.0.0.1/local" },
      { sourcePath: "C:\\Users\\creator\\image.png" },
      { url: "https://storage.example.test/image.png?token=secret" },
      { apiKey: "must-not-persist" },
      { prompt: "render with sk-canvas-secret-1234567890" },
      { prompt: "inspect https://storage.example.test/image.png?signature=embedded-secret before rendering" },
      { prompt: "load C:\\Users\\creator\\embedded.png before rendering" },
    ]) {
      assert.throws(
        () => validateCanvasDocumentEnvelope({ nodes: [{ id: "node", data }], edges: [] }),
        (error) => error instanceof CanvasValidationError && [
          "canvas_document_sensitive_field_forbidden",
          "canvas_document_ephemeral_value_forbidden",
        ].includes(error.code),
      );
    }
    assert.doesNotThrow(() => validateCanvasDocumentEnvelope({
      nodes: [{ id: "node", data: { storageObjectId: "stable-id", url: "https://cdn.example.test/image.png" } }],
      edges: [],
    }));
  });

  it("validates versioned node and edge protocol while retaining historical node types", () => {
    assert.doesNotThrow(() => validateCanvasDocumentProtocol({
      nodes: [
        { id: "new", type: "ai-markdown" },
        { id: "legacy", type: "script" },
      ],
      edges: [{
        id: "reference-1",
        kind: "reference",
        sourceNodeId: "new",
        sourcePortId: "out",
        targetNodeId: "legacy",
        targetPortId: "in",
      }],
    }));
    assertCanvasError(
      () => validateCanvasDocumentProtocol({ nodes: [{ id: "bad", type: "arbitrary-script" }], edges: [] }),
      "canvas_node_type_invalid",
    );
    assertCanvasError(
      () => validateCanvasDocumentProtocol({
        nodes: [{ id: "same", type: "ai-text" }, { id: "same", type: "ai-image" }],
        edges: [],
      }),
      "canvas_node_id_invalid",
    );
  });

  it("allows reference cycles while rejecting execution cycles", () => {
    const nodes = [
      { id: "a", data: { ports: { inputs: [{ id: "in", kind: "text" }], outputs: [{ id: "out", kind: "text" }] } } },
      { id: "b", data: { ports: { inputs: [{ id: "in", kind: "text" }], outputs: [{ id: "out", kind: "text" }] } } },
    ];
    assert.doesNotThrow(() => validateCanvasDocumentGraph({
      nodes,
      edges: [
        { id: "one", kind: "reference", sourceNodeId: "a", sourcePortId: "out", targetNodeId: "b", targetPortId: "in" },
        { id: "two", kind: "reference", sourceNodeId: "b", sourcePortId: "out", targetNodeId: "a", targetPortId: "in" },
      ],
    }));
  });

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
