import assert from "node:assert/strict";
import { describe, it, test } from "node:test";

import {
  CANVAS_PROMPT_EXPANSION_ORDER,
  parseCanvasPromptReferences,
  resolveCanvasPromptReferences,
  upsertCanvasPromptReference,
} from "../src/features/production-workbench/canvas/canvas-prompt-reference.js";
import { buildCanvasRunPreview } from "../src/features/production-workbench/canvas/canvas-state.js";

describe("Canvas prompt references", () => {
  it("parses supported references in source order", () => {
    assert.deepEqual(
      parseCanvasPromptReferences("Use @asset:hero and @style:ink-v2"),
      [
        { token: "@asset:hero", type: "asset", id: "hero", version: null },
        { token: "@style:ink-v2", type: "style", id: "ink-v2", version: null },
      ],
    );
  });

  it("parses node, model, voice, and drama references without resolving display names", () => {
    assert.deepEqual(
      parseCanvasPromptReferences("@node:node-1@4 @model:model-id@revision-id @voice:voice-id @drama:drama-id"),
      [
        { token: "@node:node-1@4", type: "node", id: "node-1", version: "4" },
        { token: "@model:model-id@revision-id", type: "model", id: "model-id", version: "revision-id" },
        { token: "@voice:voice-id", type: "voice", id: "voice-id", version: null },
        { token: "@drama:drama-id", type: "drama", id: "drama-id", version: null },
      ],
    );
  });

  it("expands catalog content deterministically and preserves the source", () => {
    const result = resolveCanvasPromptReferences(
      "@style:ink, @asset:hero. @prompt:lighting@2",
      {
        style: { ink: { content: "black ink line art", status: "active" } },
        asset: [{ id: "hero", prompt: "a red-coated heroine", accessible: true }],
        prompt: {
          lighting: {
            versions: { 2: { text: "soft rim light", status: "published" } },
          },
        },
      },
      { strict: true },
    );

    assert.equal(result.ok, true);
    assert.equal(result.sourcePrompt, "@style:ink, @asset:hero. @prompt:lighting@2");
    assert.equal(result.expandedPrompt, "black ink line art, a red-coated heroine. soft rim light");
    assert.deepEqual(result.diagnostics, []);
  });

  it("reports missing, forbidden, unavailable, and unsupported references", () => {
    const result = resolveCanvasPromptReferences(
      "@asset:missing @style:private @skill:draft @unknown:item",
      {
        style: { private: { content: "secret", accessible: false } },
        skill: { draft: { content: "draft skill", status: "archived" } },
      },
      { strict: true },
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((item) => item.code), [
      "reference_not_found",
      "reference_forbidden",
      "reference_unavailable",
      "unsupported_reference_type",
    ]);
    assert.equal(result.expandedPrompt, result.sourcePrompt);
  });

  it("expands nested references in a deterministic order and diagnoses cycles", () => {
    const nested = resolveCanvasPromptReferences("@skill:compose", {
      skill: { compose: { content: "compose with @style:ink", status: "active" } },
      style: { ink: { content: "black ink", status: "active" } },
    }, { strict: true });
    assert.equal(nested.expandedPrompt, "compose with black ink");
    assert.deepEqual(nested.references.map((item) => item.type), ["skill", "style"]);
    assert.deepEqual(nested.expansionOrder, CANVAS_PROMPT_EXPANSION_ORDER);

    const cyclic = resolveCanvasPromptReferences("@style:loop@1", {
      style: { loop: { versions: { 1: { content: "@style:loop@1", status: "active" } } } },
    }, { strict: true });
    assert.equal(cyclic.ok, false);
    assert.equal(cyclic.diagnostics[0].code, "reference_cycle");
    assert.deepEqual(cyclic.diagnostics[0].path, ["style:loop@1", "style:loop@1"]);
  });

  it("expands references in run previews and exposes a snapshot for history", () => {
    const preview = buildCanvasRunPreview({
      promptReferenceStrict: true,
      promptReferenceCatalog: {
        style: { noir: { value: "high contrast noir", status: "active" } },
      },
      nodes: [{
        id: "generate",
        type: "send",
        data: { modelCode: "image-model", mediaKind: "image", prompt: "portrait, @style:noir" },
      }],
      edges: [],
    }, "generate");

    assert.equal(preview.ok, true);
    assert.equal(preview.sourcePrompt, "portrait, @style:noir");
    assert.equal(preview.prompt, "portrait, high contrast noir");
    assert.equal(preview.promptReferences.references[0].type, "style");
  });

  it("blocks a strict run when a referenced resource is no longer accessible", () => {
    const preview = buildCanvasRunPreview({
      promptReferenceStrict: true,
      promptReferenceCatalog: {
        asset: { hero: { value: "hero image", accessible: false } },
      },
      nodes: [{
        id: "generate",
        type: "send",
        data: { modelCode: "image-model", mediaKind: "image", prompt: "@asset:hero" },
      }],
      edges: [],
    }, "generate");

    assert.equal(preview.ok, false);
    assert.equal(preview.reason, "canvas_prompt_reference_invalid");
    assert.equal(preview.promptReferences.diagnostics[0].code, "reference_forbidden");
  });
});

test("stores immutable config versions in the Canvas reference catalog", () => {
  const document = upsertCanvasPromptReference({ version: 1 }, "style", {
    id: "ink",
    version: "3",
    status: "active",
    content: "水墨线稿",
  });
  assert.equal(document.promptReferenceCatalog.style.ink.version, "3");
  assert.equal(
    resolveCanvasPromptReferences("@style:ink@3", document.promptReferenceCatalog, { strict: true }).expandedPrompt,
    "水墨线稿",
  );
  assert.equal(
    resolveCanvasPromptReferences("@style:ink@2", document.promptReferenceCatalog, { strict: true }).diagnostics[0].code,
    "reference_not_found",
  );
});
