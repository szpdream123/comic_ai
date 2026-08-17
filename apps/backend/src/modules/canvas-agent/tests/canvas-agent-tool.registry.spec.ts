import assert from "node:assert/strict";
import test from "node:test";

import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";
import { __canvasAgentExecutorTestUtils } from "../canvas-agent-executor.ts";
import { CanvasAgentPolicyService } from "../canvas-agent-policy.service.ts";
import { createDefaultCanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";

const actor = {
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  actorTeamMemberId: null,
  capabilities: new Set(["canvas:view", "canvas:edit", "canvas:run"]),
};

test("media-only generation honors the selected confirmation mode", () => {
  const approval = { decision: "require_approval" as const, reason: "b_mode_effect" };
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.effectivePolicyForCapabilityProfile(
      approval,
      "media_generation_only",
      "generation.create",
    ),
    { decision: "allow", reason: "media_generation_policy" },
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.effectivePolicyForCapabilityProfile(
      { decision: "allow", reason: "c_mode_effect" },
      "media_generation_only",
      "generation.create",
      { generationPermissionMode: "approval_required" },
    ),
    { decision: "require_approval", reason: "generation_confirmation_required" },
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.effectivePolicyForCapabilityProfile(approval, "canvas", "generation.create"),
    approval,
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.effectivePolicyForCapabilityProfile(approval, "media_generation_only", "canvas.patch"),
    approval,
  );
});

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

test("video.inspect reads only authorized video metadata and leaves visual semantics to the current model", async () => {
  let inspectedGrantId = "";
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
    context: {
      resolveFileGrant: async ({ grantId }) => ({
        storageObjectId: "storage-video",
        purpose: "视频参考",
        contentType: grantId === "grant-video" ? "video/mp4" : "image/png",
      }),
    },
    inspectVideo: async ({ grantId }) => {
      inspectedGrantId = grantId;
      return { durationMs: 1_000, video: { width: 1920, height: 1080 } };
    },
  });
  const result = await registry.execute("video.inspect", { grantId: "grant-video" }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-1",
  });
  assert.equal(inspectedGrantId, "grant-video");
  assert.deepEqual(result.output, {
    contentType: "video/mp4",
    durationMs: 1_000,
    video: { width: 1920, height: 1080 },
  });
  await assert.rejects(
    registry.execute("video.inspect", { grantId: "grant-image" }, {
      canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-2", actor, callId: "call-2",
    }),
    /canvas_agent_video_grant_required/,
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
    request: { model: "image-model", prompt: "a tree" },
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

test("media-generation-only tools allow detached image, video, and audio generation only", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async (input) => { calls.push(input); return { generationTaskId: "generation-1" }; } },
  });
  const context = {
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    agentTaskId: "task-1",
    agentStepId: "step-1",
    actor: { ownerUserId: "user-1", capabilities: new Set<string>() },
    callId: "call-1",
    capabilityProfile: "media_generation_only" as const,
  };

  await registry.execute("generation.create", {
    kind: "image",
    request: { model: "image-model", prompt: "雨夜城市" },
  }, context);
  assert.equal(calls[0]?.placement, "detached");
  await registry.execute("generation.create", {
    kind: "audio",
    request: { model: "audio-model", prompt: "旁白" },
  }, context);
  assert.equal(calls[1]?.placement, "detached");
  assert.equal(calls[1]?.kind, "audio");
  await assert.rejects(registry.execute("generation.create", {
    kind: "video",
    targetNodeId: "node-1",
    request: { model: "video-model", prompt: "推进镜头" },
  }, context), /canvas_agent_generation_target_not_allowed/);
});

test("executor exposes only detached media tools without changing Canvas Agent tools", () => {
  const generationTool = {
    id: "generation.create",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["image", "video", "audio"] },
        targetNodeId: { type: "string" },
        request: { type: "object" },
      },
    },
  };
  const tools = [{ id: "canvas.read" }, { id: "canvas.patch" }, generationTool];

  const mediaTools = __canvasAgentExecutorTestUtils.toolsForCapabilityProfile(
    tools,
    "media_generation_only",
  );
  assert.deepEqual(mediaTools.map((tool) => tool.id), ["generation.create"]);
  const mediaProperties = mediaTools[0]?.inputSchema?.properties as Record<string, unknown>;
  assert.deepEqual(mediaProperties.kind, { type: "string", enum: ["image", "video", "audio"] });
  assert.equal("targetNodeId" in mediaProperties, false);

  assert.throws(
    () => __canvasAgentExecutorTestUtils.assertToolAllowedForCapabilityProfile(
      "canvas.patch", {}, "media_generation_only",
    ),
    /canvas_agent_tool_not_allowed/,
  );
  assert.doesNotThrow(
    () => __canvasAgentExecutorTestUtils.assertToolAllowedForCapabilityProfile(
      "generation.create", { kind: "audio" }, "media_generation_only",
    ),
  );
  assert.throws(
    () => __canvasAgentExecutorTestUtils.assertToolAllowedForCapabilityProfile(
      "generation.create", { kind: "video", targetNodeId: "node-1" }, "media_generation_only",
    ),
    /canvas_agent_generation_target_not_allowed/,
  );

  const canvasTools = __canvasAgentExecutorTestUtils.toolsForCapabilityProfile(tools, "canvas");
  assert.deepEqual(canvasTools, [{ id: "canvas.patch" }, generationTool]);
  assert.doesNotThrow(() => __canvasAgentExecutorTestUtils.assertToolAllowedForCapabilityProfile(
    "canvas.patch", {}, "canvas",
  ));
});

test("media tool resolves authorized file grants into reference images", async () => {
  let request: Record<string, unknown> | undefined;
  let targetNodeId: string | null | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    context: {
      resolveFileGrant: async (input) => {
        assert.equal(input.grantId, "grant-1");
        assert.equal(input.canvasId, "canvas-1");
        assert.equal(input.conversationId, "conversation-1");
        return { storageObjectId: "storage-1", purpose: "角色参考", contentType: "image/png" };
      },
    },
    generationIntake: {
      create: async (input) => {
        request = input.request;
        targetNodeId = input.targetNodeId;
        return { generationTaskId: "generation-1" };
      },
    },
  });
  await registry.execute("generation.create", {
    kind: "image",
    fileGrantIds: ["grant-1"],
    request: { model: "image-model", prompt: "保持角色外观" },
  }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-1",
  });
  assert.deepEqual((request?.parameters as Record<string, unknown>)?.referenceImages, [{
    storageObjectId: "storage-1",
    tag: "图1",
  }]);
  assert.equal(request?.prompt, "保持角色外观 【@图1】");
  assert.equal(targetNodeId, null);
});

test("media tool does not reuse a referenced input node as its generation target", async () => {
  let targetNodeId: string | null | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: {
      create: async (input) => {
        targetNodeId = input.targetNodeId;
        return { generationTaskId: "generation-targeted" };
      },
    },
  });
  await registry.execute("generation.create", {
    kind: "image",
    request: { model: "image-model", prompt: "重新生成这张图片" },
  }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-target",
    referencedNodeIds: ["referenced-image-node"],
  });
  assert.equal(targetNodeId, null);
});

test("executor persists every attached media grant on a generation step before approval", () => {
  const input = { kind: "image", request: { model: "image-model", prompt: "改成白天" } };
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.bindReferencedGenerationInput(
      "generation.create",
      input,
      ["referenced-image-node"],
      ["referenced-file-grant"],
    ),
    {
      ...input,
      fileGrantIds: ["referenced-file-grant"],
    },
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.bindReferencedGenerationInput(
      "generation.create",
      input,
      ["image-one", "image-two"],
      [],
    ),
    input,
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.bindReferencedGenerationInput(
      "generation.create",
      { ...input, fileGrantIds: ["model-file-grant"] },
      [],
      ["attached-image-grant", "attached-video-grant", "attached-audio-grant"],
    ).fileGrantIds,
    ["model-file-grant", "attached-image-grant", "attached-video-grant", "attached-audio-grant"],
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.fileGrantIdsFromContent({
      fileGrantIds: ["grant-one"],
      nodeReferences: [{ fileGrantId: "grant-one" }, { fileGrantId: "grant-two" }],
      attachments: [{ fileGrantId: "grant-three" }],
    }),
    ["grant-one", "grant-two", "grant-three"],
  );
});

test("executor binds the selected homepage kind, model, and parameters to media generation", () => {
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.bindReferencedGenerationInput(
      "generation.create",
      { kind: "image", request: { model: "agent-image", prompt: "生成角色图" } },
      [],
      [],
      { image: "selected-image", video: "selected-video" },
    ),
    { kind: "image", request: { model: "selected-image", prompt: "生成角色图" } },
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.bindReferencedGenerationInput(
      "generation.create",
      { kind: "video", request: { model: "agent-video", prompt: "生成镜头" } },
      [],
      [],
      { image: "selected-image", video: "selected-video" },
    ),
    { kind: "video", request: { model: "selected-video", prompt: "生成镜头" } },
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.bindReferencedGenerationInput(
      "generation.create",
      {
        kind: "image",
        request: {
          model: "agent-image",
          prompt: "生成 16:9 的 4K 角色图",
          parameters: { aspectRatio: "16:9", quality: "4K" },
        },
      },
      [],
      [],
      { image: "selected-image", video: "selected-video", audio: "selected-audio" },
      "image",
      { image: { aspectRatio: "auto", quality: "2K" } },
    ),
    {
      kind: "image",
      request: {
        model: "selected-image",
        prompt: "生成 16:9 的 4K 角色图",
        parameters: { aspectRatio: "16:9", quality: "4K" },
      },
    },
  );
});

test("executor reads supported free-generation preferences without changing invalid values", () => {
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.preferredModelsFromContent({
      preferredModels: { image: " image-pro ", video: "", audio: "audio-pro" },
    }),
    { image: "image-pro", audio: "audio-pro" },
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.preferredGenerationKindFromContent({ preferredGenerationKind: "audio" }),
    "audio",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.preferredGenerationKindFromContent({ preferredGenerationKind: "document" }),
    "",
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.preferredGenerationParametersFromContent({
      preferredGenerationParameters: {
        image: { ratio: "16:9" },
        audio: { voice: "narrator" },
        document: { pages: 2 },
      },
    }),
    { image: { ratio: "16:9" }, audio: { voice: "narrator" } },
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.preferredModelsForCapabilityProfile(
      { image: "image-pro", video: "video-pro", audio: "audio-pro" },
      "canvas",
    ),
    { image: "image-pro", video: "video-pro" },
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.preferredModelsForCapabilityProfile(
      { image: "image-pro", video: "video-pro", audio: "audio-pro" },
      "media_generation_only",
    ),
    { image: "image-pro", video: "video-pro", audio: "audio-pro" },
  );
});

test("executor accepts fenced and prose-wrapped JSON model responses", () => {
  const expected = {
    kind: "tool_call",
    toolId: "canvas.patch",
    callId: "call-1",
    input: { expectedRevision: 1, operations: [] },
  };
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.parseTurn(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``),
    expected,
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.parseTurn(`我会按以下操作执行：${JSON.stringify(expected)} 已准备完成。`),
    expected,
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.parseTurn(`<tool_calls>\n<tool_call id="call-1">\n${JSON.stringify({ toolId: expected.toolId, input: expected.input })}\n</tool_call>\n</tool_calls>`),
    expected,
  );
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.parseTurn(`<tool_call id="call-1">${JSON.stringify({ name: expected.toolId, arguments: JSON.stringify(expected.input) })}</tool_call>`),
    expected,
  );
  assert.throws(
    () => __canvasAgentExecutorTestUtils.parseTurn("我无法按协议执行"),
    /canvas_agent_model_response_invalid_json/,
  );
});

test("executor classifies duplicate tool calls without weakening side-effect protection", () => {
  assert.equal(
    __canvasAgentExecutorTestUtils.duplicateCanvasAgentStepKind({
      code: "23505",
      constraint: "canvas_agent_steps_task_call_unique",
    }),
    "call",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.duplicateCanvasAgentStepKind({
      code: "23505",
      message: "duplicate_key_value_violates_unique_constraint_canvas_agent_steps_effect_fingerprint_unique",
    }),
    "effect",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.duplicateCanvasAgentStepKind({
      code: "23505",
      constraint: "other_unique_constraint",
    }),
    undefined,
  );
});

test("Canvas Agent context omits a duplicate canvas.read document from history", async () => {
  const db = {
    async query<T>(sql: string) {
      if (sql.includes("SELECT summary_json FROM canvas_agent_conversations")) {
        return { rows: [{ summary_json: {} }] as T[] };
      }
      if (sql.includes("FROM canvas_agent_messages")) {
        return { rows: [
          { role: "assistant", sequence: 4, content_json: { message: "已删除粗布节点" } },
          { role: "tool", sequence: 3, content_json: { toolId: "canvas.patch", callId: "patch-1", output: { revision: 4 } } },
          {
            role: "tool",
            sequence: 2,
            content_json: {
              toolId: "canvas.read",
              callId: "read-1",
              output: {
                canvasProjectId: "canvas-1",
                serverRevision: 4,
                document: {
                  nodes: [{ id: "node-1", largeMetadata: "x".repeat(10_000) }],
                  edges: [{ id: "edge-1" }],
                },
              },
            },
          },
          { role: "user", sequence: 1, content_json: { text: "删除粗布节点" } },
        ] as T[] };
      }
      if (sql.includes("UPDATE canvas_agent_file_grants") || sql.includes("FROM canvas_agent_file_grants")) {
        return { rows: [] as T[] };
      }
      if (sql.includes("SELECT id FROM canvas_agent_conversations")) {
        return { rows: [{ id: "conversation-1" }] as T[] };
      }
      throw new Error(`unexpected_query:${sql}`);
    },
  } as never;
  const context = await new CanvasAgentContextService({
    db,
    loadCanvasContext: async () => ({ document: { nodes: [], edges: [] } }),
  }).build({
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    actor,
  });

  assert.deepEqual(context.messages[0]?.content, { text: "删除粗布节点" });
  assert.deepEqual(context.messages[1]?.content, {
    toolId: "canvas.read",
    callId: "read-1",
    output: {
      canvasProjectId: "canvas-1",
      serverRevision: 4,
      document: { nodeCount: 1, edgeCount: 1, availableInContext: true },
    },
  });
  assert.deepEqual(context.messages[2]?.content, {
    toolId: "canvas.patch",
    callId: "patch-1",
    output: { revision: 4 },
  });
  assert.deepEqual(context.messages[3]?.content, { message: "已删除粗布节点" });
  assert.equal(JSON.stringify(context).includes("largeMetadata"), false);
});

test("Canvas Agent executor preserves conversation history while removing duplicate canvas reads", () => {
  const context = {
    canvas: { document: { nodes: [{ id: "node-current" }] } },
    messages: [
      { role: "user", content: { text: "删除粗布节点" }, sequence: 1 },
      {
        role: "tool",
        content: {
          toolId: "canvas.read",
          callId: "read-1",
          output: {
            canvasProjectId: "canvas-1",
            serverRevision: 4,
            document: {
              nodes: [{ id: "node-old", largeMetadata: "x".repeat(10_000) }],
              edges: [{ id: "edge-old" }],
            },
          },
        },
        sequence: 2,
      },
      { role: "assistant", content: { message: "已删除粗布节点" }, sequence: 3 },
    ],
  };

  const compacted = __canvasAgentExecutorTestUtils.compactCanvasReadMessagesForModel(context) as typeof context;
  assert.deepEqual(compacted.canvas, context.canvas);
  assert.deepEqual(compacted.messages[0], context.messages[0]);
  assert.deepEqual(compacted.messages[2], context.messages[2]);
  assert.equal(JSON.stringify(compacted).includes("largeMetadata"), false);
  assert.deepEqual(
    __canvasAgentExecutorTestUtils.omitRedundantCanvasReadTool([
      { id: "canvas.read" }, { id: "canvas.patch" }, { id: "generation.create" },
    ]),
    [{ id: "canvas.patch" }, { id: "generation.create" }],
  );
});

test("media tool can use multiple referenced inputs while creating a new node", async () => {
  let targetNodeId: string | null | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async (input) => {
      targetNodeId = input.targetNodeId;
      return { generationTaskId: "generation-multiple-references" };
    } },
  });
  await registry.execute("generation.create", {
    kind: "image",
    request: { model: "image-model", prompt: "结合两张参考图生成新图" },
  }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-target-required",
    referencedNodeIds: ["image-one", "image-two"],
  });
  assert.equal(targetNodeId, null);
});

test("media tool keeps document grants out of image references", async () => {
  let request: Record<string, unknown> | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    context: {
      resolveFileGrant: async () => ({
        storageObjectId: "storage-document",
        purpose: "剧情文档",
        contentType: "application/pdf",
      }),
    },
    generationIntake: {
      create: async (input) => {
        request = input.request;
        return { generationTaskId: "generation-from-document" };
      },
    },
  });
  await registry.execute("generation.create", {
    kind: "image",
    fileGrantIds: ["grant-document"],
    request: { model: "image-model", prompt: "根据文档内容生成场景" },
  }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-document",
  });
  assert.equal((request?.parameters as Record<string, unknown> | undefined)?.referenceImages, undefined);
});

test("media tool resolves an authorized video grant into sourceVideo", async () => {
  let request: Record<string, unknown> | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    context: {
      resolveFileGrant: async () => ({
        storageObjectId: "storage-video",
        purpose: "动作参考",
        contentType: "video/mp4",
      }),
    },
    generationIntake: {
      create: async (input) => {
        request = input.request;
        return { generationTaskId: "generation-video" };
      },
    },
  });
  await registry.execute("generation.create", {
    kind: "video",
    fileGrantIds: ["grant-video"],
    request: { model: "video-model", prompt: "保持参考动作" },
  }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-video",
  });
  assert.deepEqual((request?.parameters as Record<string, unknown>)?.sourceVideo, {
    storageObjectId: "storage-video",
    tag: "视频1",
  });
  assert.equal(request?.prompt, "保持参考动作 【@视频1】");
  assert.equal((request?.parameters as Record<string, unknown>)?.referenceImages, undefined);
});

test("media tool resolves image, video, and audio grants into signed media references", async () => {
  let request: Record<string, unknown> | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    context: {
      resolveFileGrant: async ({ grantId }) => ({
        storageObjectId: `storage-${grantId}`,
        purpose: "自由生成参考",
        contentType: grantId === "image" ? "image/png" : grantId === "video" ? "video/mp4" : "audio/mpeg",
      }),
    },
    resolveFileAttachment: async ({ grantId }) => ({ url: `https://signed.example/${grantId}` }),
    generationIntake: {
      create: async (input) => {
        request = input.request;
        return { generationTaskId: "generation-all-references" };
      },
    },
  });
  await registry.execute("generation.create", {
    kind: "video",
    fileGrantIds: ["image", "video", "audio"],
    request: { model: "video-model", prompt: "按全部参考生成" },
  }, {
    canvasId: "free-generation", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-all-media",
    capabilityProfile: "media_generation_only",
  });
  const parameters = request?.parameters as Record<string, unknown>;
  assert.deepEqual(parameters.referenceImages, [{ storageObjectId: "storage-image", tag: "图1", url: "https://signed.example/image" }]);
  assert.deepEqual(parameters.sourceVideo, { storageObjectId: "storage-video", tag: "视频1", url: "https://signed.example/video" });
  assert.deepEqual(parameters.referenceAudio, { storageObjectId: "storage-audio", tag: "音频1", url: "https://signed.example/audio" });
  assert.equal(request?.prompt, "按全部参考生成 【@图1】 【@视频1】 【@音频1】");
});

test("media tool retains an authorized video grant when generating an image", async () => {
  let request: Record<string, unknown> | undefined;
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    context: {
      resolveFileGrant: async () => ({
        storageObjectId: "storage-video",
        purpose: "动作参考",
        contentType: "video/mp4",
      }),
    },
    generationIntake: {
      create: async (input) => {
        request = input.request;
        return { generationTaskId: "generation-image" };
      },
    },
  });
  await registry.execute("generation.create", {
    kind: "image",
    fileGrantIds: ["grant-video"],
    request: { model: "image-model", prompt: "保留参考视频的动作" },
  }, {
    canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1", agentStepId: "step-1", actor, callId: "call-image-video",
  });
  assert.deepEqual((request?.parameters as Record<string, unknown>)?.sourceVideo, { storageObjectId: "storage-video", tag: "视频1" });
});

test("media tool requires an explicit model code", () => {
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 2 }),
    generationIntake: { create: async () => ({ generationTaskId: "generation-1" }) },
  });
  assert.throws(
    () => registry.validate("generation.create", {
      kind: "image",
      request: { prompt: "a tree" },
    }),
    /canvas_agent_tool_input_invalid/,
  );
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

test("Canvas Agent adds granted visual attachments only for compatible model capabilities", async () => {
  const resolvedGrantIds: string[] = [];
  const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
    modelInput: { protocol: { version: 1 }, context: {} },
    context: {
      messages: [{
        role: "user",
        content: {
          text: "analyze attachments",
          attachments: [
            { fileGrantId: "grant-image", kind: "image" },
            { fileGrantId: "grant-video", kind: "video" },
          ],
        },
      }],
    },
    modelCapabilities: { vision: true, videoInput: false },
    resolveFileAttachment: async ({ fileGrantId }) => {
      resolvedGrantIds.push(fileGrantId);
      return fileGrantId === "grant-image"
        ? { url: "https://media.example.test/reference.png", contentType: "image/png" }
        : { url: "https://media.example.test/reference.mp4", contentType: "video/mp4" };
    },
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    actor: {
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      actorTeamMemberId: null,
    },
  });

  assert.deepEqual(resolvedGrantIds, ["grant-image", "grant-video"]);
  const userMessage = messages[1];
  assert.match(String(messages[0]?.content ?? ""), /current task model and attached video input/);
  assert.equal(userMessage.role, "user");
  assert.ok(Array.isArray(userMessage.content));
  assert.equal(userMessage.content.filter((part) => part.type === "image_url").length, 1);
  assert.equal(userMessage.content.filter((part) => part.type === "video_url").length, 0);
});

test("model instructions use the 灵曦AI product identity", async () => {
  const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
    modelInput: { protocol: { version: 1 }, context: {} },
    context: {},
    modelCapabilities: {},
    modelDisplayName: "Image-2（优惠）",
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    actor: { ownerUserId: "user-1", capabilities: new Set<string>() },
  });

  assert.match(String(messages[0]?.content), /灵曦AI/);
  assert.doesNotMatch(String(messages[0]?.content), /You are the Canvas Agent/);
  assert.match(String(messages[0]?.content), /灵曦AI are this product brand/);
  assert.doesNotMatch(String(messages[0]?.content), /当前会话使用的模型为Image-2（优惠）/);
  assert.match(String(messages[0]?.content), /Never disclose model codes, provider names, model identifiers/);
});

test("assistant response sanitizer replaces internal, user, and pricing disclosures", () => {
  for (const message of [
    "后台数据库包含其他用户资料。",
    "当前价格为 99 元，余额为 20 积分。",
  ]) {
    assert.equal(
      __canvasAgentExecutorTestUtils.sanitizeAssistantMessage(message),
      "请描述你的创作需求，我会继续协助。",
    );
  }
});

test("assistant response sanitizer preserves model guidance but hides model codes", () => {
  assert.equal(
    __canvasAgentExecutorTestUtils.sanitizeAssistantMessage(
      "我是 Canvas Agent，当前会话是文本模型和媒体模型的组合，请在右上角切换文本模型。",
    ),
    "我是灵曦AI，当前会话是文本模型和媒体模型的组合，请在右上角切换文本模型。",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.sanitizeAssistantMessage("我是 Canvas Agent，当前模型为 cumo-gpt-image-2-pro。"),
    "当前会话使用的模型可在右上角查看和切换。",
  );
});

test("assistant response sanitizer replaces generation provider failures with public guidance", () => {
  assert.equal(
    __canvasAgentExecutorTestUtils.sanitizeAssistantMessage(
      "音频生成失败：所选模型 soundclone 不受当前平台支持（model_provider_unsupported）。",
    ),
    "当前所选生成模型暂不可用，请在右侧切换可用模型后重试。",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.sanitizeAssistantMessage(
      "任务返回 generation_queue_error 并标记为 manual_review_required。",
    ),
    "生成任务暂时无法完成，请稍后重试。",
  );
});

test("text model switching is distinguished from media model switching", () => {
  assert.equal(__canvasAgentExecutorTestUtils.isTextModelSwitchRequest("帮我切换当前模型"), true);
  assert.equal(__canvasAgentExecutorTestUtils.isTextModelSwitchRequest("请将模型切换成 GPT"), true);
  assert.equal(__canvasAgentExecutorTestUtils.isTextModelSwitchRequest("请切换视频模型"), false);
  assert.equal(__canvasAgentExecutorTestUtils.isMediaModelSwitchRequest("帮我切换图片模型"), true);
  assert.equal(__canvasAgentExecutorTestUtils.isMediaModelSwitchRequest("请切换视频模型"), true);
  assert.equal(__canvasAgentExecutorTestUtils.isMediaModelSwitchRequest("请选择音频模型"), true);
  assert.equal(
    __canvasAgentExecutorTestUtils.mediaModelSwitchGuidanceFor("帮我切换图片模型"),
    "可以切换图片模型，请在侧边栏的“图片”模型按钮中选择需要的模型。",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.mediaModelSwitchGuidanceFor("请切换视频模型"),
    "可以切换视频模型，请在侧边栏的“视频”模型按钮中选择需要的模型。",
  );
  assert.equal(
    __canvasAgentExecutorTestUtils.mediaModelSwitchGuidanceFor("请选择音频模型"),
    "可以切换音频模型，请在侧边栏的“音频”模型按钮中选择需要的模型。",
  );
});

test("model information requests return guidance without invoking media generation", () => {
  assert.equal(
    __canvasAgentExecutorTestUtils.modelInformationGuidanceFor("现在是什么模型？"),
    "当前会话使用的模型可在右上角查看和切换。",
  );
  assert.equal(__canvasAgentExecutorTestUtils.modelInformationGuidanceFor("生成一个 5 秒视频"), "");
});

test("assistant response sanitizer introduces 灵曦 instead of presenting it as unknown", () => {
  assert.equal(
    __canvasAgentExecutorTestUtils.sanitizeAssistantMessage("我无法确认灵曦AI具体指哪家公司。"),
    "灵曦AI是 AI 创作平台，为创作者提供从灵感和剧本，到角色、场景、分镜，以及图片、视频和音频生成的一体化创作能力。",
  );
});

test("Canvas Agent recognizes array-based model input capabilities", async () => {
  const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
    modelInput: { protocol: { version: 1 }, context: {} },
    context: {
      messages: [{
        role: "user",
        content: {
          text: "analyze attachments",
          attachments: [
            { fileGrantId: "grant-image", kind: "image" },
            { fileGrantId: "grant-video", kind: "video" },
          ],
        },
      }],
    },
    modelCapabilities: { input: ["prompt", "image_url", "input_file"], output: ["text", "json"] },
    resolveFileAttachment: async ({ fileGrantId }) => fileGrantId === "grant-image"
      ? { url: "https://media.example.test/reference.png", contentType: "image/png" }
      : { url: "https://media.example.test/reference.mp4", contentType: "video/mp4" },
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    actor: {
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      actorTeamMemberId: null,
    },
  });

  const userMessage = messages[1];
  assert.equal(userMessage.role, "user");
  assert.ok(Array.isArray(userMessage.content));
  assert.equal(userMessage.content.filter((part) => part.type === "image_url").length, 1);
  assert.equal(userMessage.content.filter((part) => part.type === "video_url").length, 1);
});
