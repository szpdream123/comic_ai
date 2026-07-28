import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ResolvedCanvasAgentTextModel } from "../admin-backed-text-model.resolver.ts";
import { CanvasAgentModelCompatibilityProbeService } from "../canvas-agent-model-compatibility-probe.service.ts";

const resolvedModel: ResolvedCanvasAgentTextModel = {
  id: "agent-text",
  label: "Agent Text",
  providerName: "provider",
  providerModel: "provider-agent-text",
  baseURL: "https://provider.example/v1",
  apiKey: "secret-from-admin-store",
  apiKeyEnv: "admin_secret_values",
  enabled: true,
  providerConfigRevisionId: "revision-1",
  credentialVersionRef: "credential-1",
  snapshot: {
    version: 1,
    modelConfigId: "model-1",
    modelCode: "agent-text",
    providerName: "provider",
    providerModel: "provider-agent-text",
    providerProtocol: "openai_compatible_chat",
    providerConfigRevisionId: "revision-1",
    credentialVersionRef: "credential-1",
    capabilities: { stream: true, toolCalling: true, jsonSchema: true, contextWindow: 32_000 },
    pricing: {},
    limits: {},
    providerConfig: { baseURL: "https://provider.example/v1" },
  },
  pricing: {},
  capabilities: { stream: true, toolCalling: true, jsonSchema: true, contextWindow: 32_000 },
};

function chunks(content: string, includeUsage = true) {
  return (async function* () {
    yield { choices: [{ delta: { content } }] };
    if (includeUsage) {
      yield { choices: [], usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 } };
    }
  })();
}

describe("Canvas Agent model compatibility probe", () => {
  it("uses the resolved admin-backed credential and verifies streaming JSON Schema output", async () => {
    const adapterCalls: Array<Record<string, unknown>> = [];
    let clock = 100;
    const service = new CanvasAgentModelCompatibilityProbeService({
      db: {} as never,
      resolver: { async resolve() { return resolvedModel; } },
      adapter: {
        async createChatCompletionStream(input) {
          adapterCalls.push(input as unknown as Record<string, unknown>);
          clock = 137;
          return chunks('{"kind":"tool_call","toolId":"canvas_read","callId":"probe-call","input":{}}') as never;
        },
      },
      now: () => clock,
    });

    const result = await service.probe("agent-text");

    assert.equal(result.ok, true);
    assert.equal(result.latencyMs, 37);
    assert.deepEqual(result.checks.map((check) => [check.key, check.status]), [
      ["resolution", "passed"],
      ["stream", "passed"],
      ["usage", "passed"],
      ["json_schema", "passed"],
    ]);
    assert.equal(adapterCalls.length, 1);
    assert.equal(adapterCalls[0].apiKey, "secret-from-admin-store");
    assert.equal(JSON.stringify(result).includes("secret-from-admin-store"), false);
  });

  it("returns a stable resolution failure without exposing resolver errors", async () => {
    let adapterCalled = false;
    const service = new CanvasAgentModelCompatibilityProbeService({
      db: {} as never,
      resolver: { async resolve() { throw new Error("secret-from-admin-store"); } },
      adapter: {
        async createChatCompletionStream() {
          adapterCalled = true;
          return chunks('{"kind":"tool_call","toolId":"canvas_read","callId":"probe-call","input":{}}') as never;
        },
      },
    });

    const result = await service.probe("agent-text");

    assert.equal(result.ok, false);
    assert.equal(result.failureCode, "canvas_agent_model_resolution_failed");
    assert.equal(adapterCalled, false);
    assert.equal(JSON.stringify(result).includes("secret-from-admin-store"), false);
  });

  it("reports providers that stream text but ignore JSON Schema", async () => {
    const service = new CanvasAgentModelCompatibilityProbeService({
      db: {} as never,
      resolver: { async resolve() { return resolvedModel; } },
      adapter: {
        async createChatCompletionStream() {
          return chunks("not-json") as never;
        },
      },
    });

    const result = await service.probe("agent-text");

    assert.equal(result.ok, false);
    assert.equal(result.failureCode, "canvas_agent_model_json_schema_failed");
    assert.deepEqual(result.checks.map((check) => check.status), ["passed", "passed", "passed", "failed"]);
  });

  it("validates the structured JSON prompt fallback without sending response_format", async () => {
    let request: Record<string, unknown> | undefined;
    const fallbackModel: ResolvedCanvasAgentTextModel = {
      ...resolvedModel,
      capabilities: {
        stream: true,
        toolCalling: false,
        jsonSchema: false,
        structuredJsonPrompt: true,
        contextWindow: 65_536,
      },
      snapshot: {
        ...resolvedModel.snapshot,
        capabilities: {
          stream: true,
          toolCalling: false,
          jsonSchema: false,
          structuredJsonPrompt: true,
          contextWindow: 65_536,
        },
      },
    };
    const service = new CanvasAgentModelCompatibilityProbeService({
      db: {} as never,
      resolver: { async resolve() { return fallbackModel; } },
      adapter: {
        async createChatCompletionStream(input) {
          request = input.request as unknown as Record<string, unknown>;
          return chunks('{"kind":"tool_call","toolId":"canvas_read","callId":"probe-call","input":{}}') as never;
        },
      },
    });

    const result = await service.probe("agent-text");

    assert.equal(result.ok, true);
    assert.equal("response_format" in (request ?? {}), false);
    assert.match(JSON.stringify(request?.messages), /no markdown or prose/);
    assert.equal(request?.max_tokens, 256);
  });

  it("rejects a streaming response that omits billable usage", async () => {
    const service = new CanvasAgentModelCompatibilityProbeService({
      db: {} as never,
      resolver: { async resolve() { return resolvedModel; } },
      adapter: {
        async createChatCompletionStream() {
          return chunks('{"kind":"tool_call","toolId":"canvas_read","callId":"probe-call","input":{}}', false) as never;
        },
      },
    });

    const result = await service.probe("agent-text");

    assert.equal(result.ok, false);
    assert.equal(result.failureCode, "canvas_agent_model_usage_missing");
    assert.deepEqual(result.checks.map((check) => [check.key, check.status]), [
      ["resolution", "passed"],
      ["stream", "passed"],
      ["usage", "failed"],
    ]);
  });
});
