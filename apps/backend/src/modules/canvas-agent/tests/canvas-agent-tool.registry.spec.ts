import assert from "node:assert/strict";
import test from "node:test";

import { CanvasAgentPolicyService } from "../canvas-agent-policy.service.ts";
import { createDefaultCanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";

const actor = {
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  actorTeamMemberId: null,
  capabilities: new Set(["canvas:view", "canvas:edit", "canvas:run"]),
};

test("tool registry validates schemas and blocks local paths", async () => {
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({ revision: 4 }),
    patchCanvas: async () => ({ revision: 5 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
  });
  await assert.rejects(
    registry.execute("canvas.patch", {
      expectedRevision: 1,
      operations: [],
      path: "C:\\private\\secret.png",
    }, {
      canvasId: "canvas-1",
      conversationId: "conversation-1",
      agentTaskId: "task-1",
      agentStepId: "step-1",
      actor,
      callId: "call-1",
    }),
    /canvas_agent_tool_input_invalid/,
  );
});

test("media tool uses generation intake and never a provider adapter", async () => {
  let calls = 0;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: {
      create: async (input) => {
        calls += 1;
        assert.equal(input.agentTaskId, "task-1");
        return { generationTaskId: "generation-1" };
      },
    },
  });
  const result = await registry.execute("generation.create", {
    kind: "image",
    request: { prompt: "a tree" },
  }, {
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    agentTaskId: "task-1",
    agentStepId: "step-1",
    actor,
    callId: "call-1",
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "waiting_external");
  assert.equal(result.generationTaskId, "generation-1");
});

test("registry exposes actor-scoped history, asset, and preset tools when platform services are supplied", async () => {
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
    readHistory: async (input) => ({ nodeKey: input.nodeKey ?? null }),
    searchAssets: async (input) => ({ search: input.search ?? null }),
    selectArtifact: async (input) => ({ artifactId: input.artifactId }),
    listPresets: async () => ({ configs: [] }),
  });
  assert.deepEqual(registry.listForModel("expert").map((tool) => tool.id), [
    "canvas.read", "canvas.read_history", "asset.search", "preset.list",
    "expert.canvas_structure", "expert.workflow_risk", "expert.asset_reuse",
  ]);
  const history = await registry.execute("canvas.read_history", { nodeKey: "node-1" }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-1",
  });
  assert.deepEqual(history.output, { nodeKey: "node-1" });
  const selected = await registry.execute("canvas.select_artifact", { artifactId: "artifact-1" }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-2",
  });
  assert.deepEqual(selected.output, { artifactId: "artifact-1" });
});

test("web tools carry the selected provider through registry execution and Policy", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
    webExtract: async (input) => {
      calls.push(input);
      return { title: "Docs" };
    },
    webSearch: async (input) => {
      calls.push(input);
      return { results: [] };
    },
    webSearchProviderId: "approved-search",
    mcpCall: async (input) => {
      calls.push(input);
      return { result: {} };
    },
  });
  const context = {
    canvasId: "canvas-1", conversationId: "conversation-1",
    agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-web",
  };
  await registry.execute("web_extract", {
    providerId: "approved-search", url: "https://docs.example.test/page",
  }, context);
  await registry.execute("web_search", {
    query: "canvas",
  }, context);
  assert.throws(
    () => registry.validate("web_search", { query: "canvas", url: "https://attacker.example/search" }),
    /canvas_agent_tool_input_invalid/,
  );
  await registry.execute("mcp.call", {
    serverId: "approved-mcp", endpoint: "https://mcp.example.test/rpc", operation: "asset.read", arguments: { limit: 1 },
  }, context);
  assert.equal(calls[0]?.providerId, "approved-search");
  assert.equal("providerId" in (calls[1] ?? {}), false);
  assert.equal("url" in (calls[1] ?? {}), false);
  assert.equal(calls[2]?.serverId, "approved-mcp");

  const extractTool = registry.get("web_extract");
  const searchTool = registry.get("web_search");
  assert.equal(typeof extractTool?.policyProviderId, "function");
  assert.equal(searchTool?.policyProviderId, "approved-search");
  assert.equal((extractTool?.policyProviderId as Function)({ providerId: "approved-search" }), "approved-search");
  const mcpTool = registry.get("mcp.call");
  assert.equal((mcpTool?.policyMcpServerId as Function)({ serverId: "approved-mcp" }), "approved-mcp");

  const policy = new CanvasAgentPolicyService({ webSearchProviderAllowlist: ["approved-search"] });
  assert.deepEqual(policy.evaluate({
    mode: "c", actor, effect: "external_network", requiredCapability: "canvas:view", providerId: "approved-search",
  }), { decision: "require_approval", reason: "external_network" });
  assert.deepEqual(policy.evaluate({
    mode: "c", actor, effect: "external_network", requiredCapability: "canvas:view", providerId: "blocked-search",
  }), { decision: "deny", reason: "web_provider_not_allowed" });
  const mcpPolicy = new CanvasAgentPolicyService({ mcpServerAllowlist: ["approved-mcp"] });
  assert.deepEqual(mcpPolicy.evaluate({
    mode: "c", actor, effect: "mcp", requiredCapability: "canvas:view", mcpServerId: "approved-mcp",
  }), { decision: "require_approval", reason: "mcp_side_effect_boundary" });
});

test("provider configuration tools are Canvas-local config writes and always cross approval policy", async () => {
  const calls = [];
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
    createProviderConfigDraft: async (input) => { calls.push(["draft", input]); return { id: "draft-1" }; },
    applyProviderConfigDraft: async (input) => { calls.push(["apply", input]); return { id: input.draftId, status: "applied" }; },
  });
  const context = {
    canvasId: "canvas-1", conversationId: "conversation-1",
    agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-config",
  };
  await registry.execute("provider.config_draft", {
    modelCode: "image-model", mediaKind: "image", generation: { imageSize: "2K" },
  }, context);
  await registry.execute("provider.config_apply", { draftId: "draft-1" }, context);
  assert.deepEqual(calls.map(([kind]) => kind), ["draft", "apply"]);
  assert.equal(registry.get("provider.config_draft")?.effect, "config_write");
  assert.equal(registry.get("provider.config_apply")?.effect, "config_write");
  const policy = new CanvasAgentPolicyService({ allowAutomaticCanvasWrites: true });
  assert.deepEqual(policy.evaluate({ mode: "c", actor, effect: "config_write", requiredCapability: "canvas:edit" }), {
    decision: "require_approval", reason: "config_write_requires_approval",
  });
  assert.deepEqual(policy.evaluate({ mode: "plan", actor, effect: "config_write", requiredCapability: "canvas:edit" }), {
    decision: "deny", reason: "plan_mode_read_only",
  });
});

test("media prompt preference tools require explicit confirmation and approval for writes", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
    promptPreferences: {
      list: async (input) => { calls.push(["list", input]); return []; },
      learn: async (input) => { calls.push(["learn", input]); return { id: "preference-1" }; },
      revoke: async (input) => { calls.push(["revoke", input]); return { id: input.preferenceId, status: "revoked" }; },
    } as never,
  });
  const context = {
    canvasId: "canvas-1", conversationId: "conversation-1",
    agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-preference",
  };
  await registry.execute("preference.read_media_prompt", { mediaKind: "image" }, context);
  await assert.rejects(() => registry.execute("preference.learn_media_prompt", {
    mediaKind: "image", instruction: "Use rim light", confirmed: false,
  }, context), /canvas_agent_tool_input_invalid/);
  await registry.execute("preference.learn_media_prompt", {
    mediaKind: "image", preferenceKey: "image.lighting",
    instruction: "Use rim light", tags: ["lighting"], confirmed: true,
  }, context);
  await registry.execute("preference.forget_media_prompt", { preferenceId: "preference-1" }, context);
  assert.deepEqual(calls.map(([kind]) => kind), ["list", "learn", "revoke"]);
  assert.equal(registry.get("preference.read_media_prompt")?.effect, "read");
  assert.equal(registry.get("preference.learn_media_prompt")?.effect, "memory_write");
  assert.equal(registry.get("preference.forget_media_prompt")?.effect, "memory_write");
  assert.ok(registry.listForModel("expert").some((tool) => tool.id === "preference.read_media_prompt"));
  assert.equal(registry.listForModel("expert").some((tool) => tool.id === "preference.learn_media_prompt"), false);
  assert.deepEqual(
    new CanvasAgentPolicyService().evaluate({
      mode: "c", actor, effect: "memory_write", requiredCapability: "canvas:run",
    }),
    { decision: "require_approval", reason: "memory_write_requires_approval" },
  );
});

test("plan mode denies side effects even when automatic writes are configured", () => {
  const policy = new CanvasAgentPolicyService({ allowAutomaticCanvasWrites: true });
  assert.deepEqual(
    policy.evaluate({
      mode: "plan",
      actor,
      effect: "canvas_write",
      requiredCapability: "canvas:edit",
    }),
    { decision: "deny", reason: "plan_mode_read_only" },
  );
});

test("expert mode only exposes read tools and denies every side effect", () => {
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({ revision: 4 }),
    patchCanvas: async () => ({ revision: 5 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
  });
  assert.deepEqual(registry.listForModel("expert").map((tool) => tool.id), [
    "canvas.read", "expert.canvas_structure", "expert.workflow_risk",
  ]);

  const policy = new CanvasAgentPolicyService({
    allowAutomaticCanvasWrites: true,
    allowAutomaticAssetWrites: true,
    allowAutomaticMediaGeneration: true,
  });
  for (const effect of ["canvas_write", "media_generation", "asset_write", "memory_write"] as const) {
    assert.deepEqual(
      policy.evaluate({ mode: "expert", actor, effect, requiredCapability: "canvas:run" }),
      { decision: "deny", reason: "expert_mode_read_only" },
    );
  }
  assert.deepEqual(
    policy.evaluate({ mode: "c", actor, effect: "canvas_write", requiredCapability: "canvas:edit" }),
    { decision: "allow", reason: "canvas_write_policy" },
  );
});
