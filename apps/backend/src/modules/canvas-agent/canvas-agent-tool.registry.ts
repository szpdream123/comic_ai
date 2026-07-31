import { assertNoLocalPath } from "./canvas-agent-context.service.ts";
import type { CanvasAgentContextService } from "./canvas-agent-context.service.ts";
import type { CanvasAgentKnowledgeService } from "./canvas-agent-knowledge.service.ts";
import type { CanvasAgentPromptPreferenceService } from "./canvas-agent-prompt-preference.service.ts";
import { assertNoCanvasAgentSensitiveValue } from "./canvas-agent-sensitive-data.ts";
import type {
  CanvasAgentActor,
  CanvasAgentGenerationIntake,
  CanvasAgentMode,
  CanvasAgentToolEffect,
} from "./canvas-agent.types.ts";

export interface CanvasAgentJsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, CanvasAgentJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: CanvasAgentJsonSchema;
  enum?: unknown[];
  minLength?: number;
  minimum?: number;
}

export interface CanvasAgentToolExecutionContext {
  canvasId: string;
  conversationId: string;
  agentTaskId: string;
  agentStepId: string;
  actor: CanvasAgentActor;
  callId: string;
  referencedNodeIds?: string[];
}

export interface CanvasAgentToolResult {
  status: "succeeded" | "waiting_external";
  output: Record<string, unknown>;
  generationTaskId?: string;
  revisionAfter?: number;
}

export interface CanvasAgentToolDefinition {
  id: string;
  description: string;
  effect: CanvasAgentToolEffect;
  requiredCapability: string;
  policyProviderId?: string | ((input: Record<string, unknown>) => string | null);
  policyMcpServerId?: string | ((input: Record<string, unknown>) => string | null);
  inputSchema: CanvasAgentJsonSchema;
  execute(
    input: Record<string, unknown>,
    context: CanvasAgentToolExecutionContext,
  ): Promise<CanvasAgentToolResult>;
}

export class CanvasAgentToolRegistry {
  private readonly tools = new Map<string, CanvasAgentToolDefinition>();

  register(tool: CanvasAgentToolDefinition) {
    if (!tool.id.trim() || this.tools.has(tool.id)) {
      throw new Error("canvas_agent_tool_registration_conflict");
    }
    this.tools.set(tool.id, tool);
    return this;
  }

  get(toolId: string) {
    return this.tools.get(toolId);
  }

  listForModel(mode?: CanvasAgentMode) {
    return [...this.tools.values()]
      .filter((tool) => mode !== "expert" || tool.effect === "read")
      .map((tool) => ({
      id: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema,
      }));
  }

  validate(toolId: string, input: unknown) {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error("canvas_agent_tool_not_allowed");
    const errors: string[] = [];
    validateSchema(tool.inputSchema, input, "$", errors);
    if (errors.length) {
      const error = new Error("canvas_agent_tool_input_invalid");
      Object.assign(error, { validationErrors: errors.slice(0, 20) });
      throw error;
    }
    assertNoLocalPath(input);
    assertNoCanvasAgentSensitiveValue(input);
    return input as Record<string, unknown>;
  }

  async execute(
    toolId: string,
    input: unknown,
    context: CanvasAgentToolExecutionContext,
  ) {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error("canvas_agent_tool_not_allowed");
    return tool.execute(this.validate(toolId, input), context);
  }
}

export function createDefaultCanvasAgentToolRegistry(deps: {
  readCanvas: (input: { canvasId: string; actor: CanvasAgentActor }) => Promise<Record<string, unknown>>;
  patchCanvas: (input: {
    canvasId: string;
    actor: CanvasAgentActor;
    expectedRevision: number;
    operations: unknown[];
    clientMutationId: string;
  }) => Promise<{ revision: number; summary?: Record<string, unknown> }>;
  generationIntake: CanvasAgentGenerationIntake;
  context?: Pick<CanvasAgentContextService, "resolveFileGrant">;
  knowledge?: Pick<CanvasAgentKnowledgeService, "listMemories" | "remember" | "readProviderDocument">;
  promptPreferences?: Pick<CanvasAgentPromptPreferenceService, "list" | "learn" | "revoke">;
  readHistory?: (input: { canvasId: string; actor: CanvasAgentActor; nodeKey?: string; search?: string; limit?: number }) => Promise<Record<string, unknown>>;
  searchAssets?: (input: { canvasId: string; actor: CanvasAgentActor; search?: string; limit?: number }) => Promise<Record<string, unknown>>;
  selectArtifact?: (input: { canvasId: string; actor: CanvasAgentActor; artifactId: string; selectionRole: string }) => Promise<Record<string, unknown>>;
  listPresets?: (input: { canvasId: string; actor: CanvasAgentActor; type?: string; limit?: number }) => Promise<Record<string, unknown>>;
  webExtract?: (input: {
    providerId: string;
    url: string;
    query?: string | null;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId: string;
    stepId: string;
  }) => Promise<Record<string, unknown>>;
  webSearch?: (input: {
    query: string;
    limit?: number;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId: string;
    stepId: string;
  }) => Promise<Record<string, unknown>>;
  webSearchProviderId?: string;
  mcpCall?: (input: {
    serverId: string;
    endpoint: string;
    operation: string;
    arguments?: Record<string, unknown>;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId: string;
    stepId: string;
  }) => Promise<Record<string, unknown>>;
  createProviderConfigDraft?: (input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId: string;
    stepId: string;
    modelCode: string;
    mediaKind: "text" | "image" | "video" | "audio";
    generation?: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  applyProviderConfigDraft?: (input: {
    draftId: string;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
  }) => Promise<Record<string, unknown>>;
  now?: () => Date;
}) {
  const registry = new CanvasAgentToolRegistry();
  registry.register({
    id: "canvas.read",
    description: "Read the current authorized canvas document and revision.",
    effect: "read",
    requiredCapability: "canvas:view",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_input, context) => ({
      status: "succeeded",
      output: await deps.readCanvas({ canvasId: context.canvasId, actor: context.actor }),
    }),
  });
  if (deps.readHistory) {
    registry.register({
      id: "canvas.read_history",
      description: "Read authorized Canvas generation history and immutable artifact references.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: {
          nodeKey: { type: "string" },
          search: { type: "string" },
          limit: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.readHistory!({
          canvasId: context.canvasId,
          actor: context.actor,
          nodeKey: typeof input.nodeKey === "string" ? input.nodeKey : undefined,
          search: typeof input.search === "string" ? input.search : undefined,
          limit: typeof input.limit === "number" ? input.limit : undefined,
        }),
      }),
    });
  }
  if (deps.searchAssets) {
    registry.register({
      id: "asset.search",
      description: "Search authorized Canvas artifacts without exposing signed URLs or local paths.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: { search: { type: "string" }, limit: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.searchAssets!({
          canvasId: context.canvasId,
          actor: context.actor,
          search: typeof input.search === "string" ? input.search : undefined,
          limit: typeof input.limit === "number" ? input.limit : undefined,
        }),
      }),
    });
  }
  if (deps.selectArtifact) {
    registry.register({
      id: "canvas.select_artifact",
      description: "Select an authorized Canvas artifact for a node after server-side revision checks.",
      effect: "asset_write",
      requiredCapability: "canvas:edit",
      inputSchema: {
        type: "object",
        properties: {
          artifactId: { type: "string", minLength: 1 },
          selectionRole: { type: "string", minLength: 1 },
        },
        required: ["artifactId"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.selectArtifact!({
          canvasId: context.canvasId,
          actor: context.actor,
          artifactId: String(input.artifactId),
          selectionRole: typeof input.selectionRole === "string" ? input.selectionRole : "current",
        }),
      }),
    });
  }
  if (deps.listPresets) {
    registry.register({
      id: "preset.list",
      description: "List authorized immutable Canvas preset, style, and Skill references.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: { type: { type: "string" }, limit: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.listPresets!({
          canvasId: context.canvasId,
          actor: context.actor,
          type: typeof input.type === "string" ? input.type : undefined,
          limit: typeof input.limit === "number" ? input.limit : undefined,
        }),
      }),
    });
  }
  if (deps.webExtract) {
    registry.register({
      id: "web_extract",
      description: "Fetch an administrator-allowlisted public web page and persist an untrusted citation.",
      effect: "external_network",
      requiredCapability: "canvas:view",
      policyProviderId: (input) => typeof input.providerId === "string" ? input.providerId : null,
      inputSchema: {
        type: "object",
        properties: {
          providerId: { type: "string", minLength: 1 },
          url: { type: "string", minLength: 1 },
          query: { type: "string" },
        },
        required: ["providerId", "url"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.webExtract!({
          providerId: String(input.providerId),
          url: String(input.url),
          query: typeof input.query === "string" ? input.query : null,
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
        }),
      }),
    });
  }
  if (deps.webSearch) {
    registry.register({
      id: "web_search",
      description: "Search through an administrator-allowlisted web provider and persist untrusted result citations.",
      effect: "external_network",
      requiredCapability: "canvas:view",
      policyProviderId: deps.webSearchProviderId ?? "canvas-agent-search",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1 },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.webSearch!({
          query: String(input.query),
          limit: typeof input.limit === "number" ? input.limit : undefined,
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
        }),
      }),
    });
  }
  if (deps.mcpCall) {
    registry.register({
      id: "mcp.call",
      description: "Invoke an administrator-allowlisted remote MCP JSON-RPC operation without local stdio access.",
      effect: "mcp",
      requiredCapability: "canvas:view",
      policyMcpServerId: (input) => typeof input.serverId === "string" ? input.serverId : null,
      inputSchema: {
        type: "object",
        properties: {
          serverId: { type: "string", minLength: 1 },
          endpoint: { type: "string", minLength: 1 },
          operation: { type: "string", minLength: 1 },
          arguments: { type: "object", additionalProperties: true },
        },
        required: ["serverId", "endpoint", "operation"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.mcpCall!({
          serverId: String(input.serverId),
          endpoint: String(input.endpoint),
          operation: String(input.operation),
          arguments: input.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)
            ? input.arguments as Record<string, unknown>
            : {},
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
        }),
      }),
    });
  }
  if (deps.createProviderConfigDraft) {
    registry.register({
      id: "provider.config_draft",
      description: "Create a Canvas-local provider configuration draft only; this does not change settings. Use it only when the user asks to change defaults, then call provider.config_apply with the returned draft id before relying on the new settings.",
      effect: "config_write",
      requiredCapability: "canvas:edit",
      inputSchema: {
        type: "object",
        properties: {
          modelCode: { type: "string", minLength: 1 },
          mediaKind: { type: "string", enum: ["text", "image", "video", "audio"] },
          generation: { type: "object", additionalProperties: true },
        },
        required: ["modelCode", "mediaKind"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.createProviderConfigDraft!({
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
          modelCode: String(input.modelCode),
          mediaKind: input.mediaKind as "text" | "image" | "video" | "audio",
          generation: input.generation && typeof input.generation === "object" && !Array.isArray(input.generation)
            ? input.generation as Record<string, unknown>
            : {},
        }),
      }),
    });
  }
  if (deps.applyProviderConfigDraft) {
    registry.register({
      id: "provider.config_apply",
      description: "Apply a provider configuration draft returned by provider.config_draft. Settings do not change until this tool succeeds.",
      effect: "config_write",
      requiredCapability: "canvas:edit",
      inputSchema: {
        type: "object",
        properties: { draftId: { type: "string", minLength: 1 } },
        required: ["draftId"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.applyProviderConfigDraft!({
          draftId: String(input.draftId),
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
        }),
      }),
    });
  }
  registry.register({
    id: "expert.canvas_structure",
    description: "Analyze authorized Canvas node, edge, and isolation structure without changing it.",
    effect: "read",
    requiredCapability: "canvas:view",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_input, context) => ({
      status: "succeeded",
      output: analyzeCanvasStructure(await deps.readCanvas({ canvasId: context.canvasId, actor: context.actor })),
    }),
  });
  registry.register({
    id: "expert.workflow_risk",
    description: "Identify deterministic workflow graph risks in the authorized Canvas.",
    effect: "read",
    requiredCapability: "canvas:view",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_input, context) => ({
      status: "succeeded",
      output: analyzeCanvasWorkflowRisks(await deps.readCanvas({ canvasId: context.canvasId, actor: context.actor })),
    }),
  });
  if (deps.searchAssets) {
    registry.register({
      id: "expert.asset_reuse",
      description: "Find reusable and duplicate authorized Canvas assets by stable references.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: { search: { type: "string" }, limit: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: analyzeCanvasAssetReuse(await deps.searchAssets!({
          canvasId: context.canvasId,
          actor: context.actor,
          search: typeof input.search === "string" ? input.search : undefined,
          limit: typeof input.limit === "number" ? input.limit : 100,
        })),
      }),
    });
  }
  registry.register({
    id: "canvas.patch",
    description: "Apply validated canvas operations against an expected revision. Use RFC 6902 add/replace/remove operations, or {type:'addEdge',edge:{id,kind,sourceNodeId,sourcePortId,targetNodeId,targetPortId,data}}. Edge node and port IDs must exist in the current canvas, and execution edges must remain acyclic.",
    effect: "canvas_write",
    requiredCapability: "canvas:edit",
    inputSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 1 },
        operations: { type: "array", items: { type: "object" } },
      },
      required: ["expectedRevision", "operations"],
      additionalProperties: false,
    },
    execute: async (input, context) => {
      const result = await deps.patchCanvas({
        canvasId: context.canvasId,
        actor: context.actor,
        expectedRevision: Number(input.expectedRevision),
        operations: input.operations as unknown[],
        clientMutationId: `agent:${context.agentTaskId}:${context.callId}`,
      });
      return {
        status: "succeeded",
        revisionAfter: result.revision,
        output: { revision: result.revision, summary: result.summary ?? {} },
      };
    },
  });
  registry.register({
    id: "generation.create",
    description: "Submit media generation through the platform generation intake. request.model must contain an active administrator model code. Pass fileGrantIds to use files explicitly authorized in the current conversation as image or video references; never invent grant IDs. When the user explicitly references a Canvas node to regenerate, pass it as targetNodeId so the result updates that node. Do not change Canvas provider defaults merely to run this tool.",
    effect: "media_generation",
    requiredCapability: "canvas:run",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["image", "video", "audio"] },
        fileGrantIds: { type: "array", items: { type: "string", minLength: 1 } },
        targetNodeId: { type: "string", minLength: 1 },
        request: {
          type: "object",
          properties: {
            model: { type: "string", minLength: 1 },
            prompt: { type: "string" },
            text: { type: "string" },
            motionPrompt: { type: "string" },
            parameters: { type: "object", additionalProperties: true },
          },
          required: ["model"],
          additionalProperties: true,
        },
      },
      required: ["kind", "request"],
      additionalProperties: false,
    },
    execute: async (input, context) => {
      const fileGrantIds = Array.isArray(input.fileGrantIds)
        ? [...new Set(input.fileGrantIds.map((value) => String(value ?? "").trim()).filter(Boolean))].slice(0, 8)
        : [];
      if (fileGrantIds.length && input.kind === "audio") throw new Error("canvas_agent_file_grant_media_kind_unsupported");
      if (fileGrantIds.length && !deps.context) throw new Error("canvas_agent_file_grant_unavailable");
      const grantedFiles: Array<{ storageObjectId: string; contentType: string }> = [];
      for (const grantId of fileGrantIds) {
        const grant = await deps.context!.resolveFileGrant({
          grantId,
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          now: deps.now?.() ?? new Date(),
        });
        grantedFiles.push({
          storageObjectId: grant.storageObjectId,
          contentType: String(grant.contentType ?? "").trim().toLowerCase(),
        });
      }
      const request = { ...(input.request as Record<string, unknown>) };
      if (grantedFiles.length) {
        const parameters = request.parameters && typeof request.parameters === "object" && !Array.isArray(request.parameters)
          ? request.parameters as Record<string, unknown>
          : {};
        const videoReferences = grantedFiles.filter((file) => file.contentType.startsWith("video/"));
        const unsupportedReferences = grantedFiles.filter((file) => file.contentType.startsWith("audio/"));
        if (unsupportedReferences.length || (input.kind === "image" && videoReferences.length)) {
          throw new Error("canvas_agent_file_grant_media_kind_unsupported");
        }
        if (videoReferences.length > 1) throw new Error("canvas_agent_video_reference_limit_exceeded");
        const imageReferences = grantedFiles.filter((file) => !file.contentType.startsWith("video/") && !file.contentType.startsWith("audio/"));
        const existingReferences = Array.isArray(parameters.referenceImages) ? parameters.referenceImages : [];
        request.parameters = {
          ...parameters,
          ...(imageReferences.length ? {
            referenceImages: [
              ...existingReferences,
              ...imageReferences.map(({ storageObjectId }) => ({ storageObjectId })),
            ],
          } : {}),
          ...(videoReferences.length ? {
            sourceVideo: { storageObjectId: videoReferences[0].storageObjectId },
          } : {}),
        };
      }
      const referencedNodeIds = context.referencedNodeIds ?? [];
      if (!input.targetNodeId && referencedNodeIds.length > 1) {
        throw new Error("canvas_agent_generation_target_node_required");
      }
      const targetNodeId = String(
        input.targetNodeId ?? (referencedNodeIds.length === 1 ? referencedNodeIds[0] : ""),
      ).trim() || null;
      const created = await deps.generationIntake.create({
        canvasId: context.canvasId,
        conversationId: context.conversationId,
        agentTaskId: context.agentTaskId,
        agentStepId: context.agentStepId,
        ownerUserId: context.actor.ownerUserId,
        actorTeamMemberId: context.actor.actorTeamMemberId ?? null,
        idempotencyKey: `canvas-agent:${context.agentTaskId}:${context.callId}`,
        kind: input.kind as "image" | "video" | "audio",
        targetNodeId,
        request,
      });
      return {
        status: "waiting_external",
        generationTaskId: created.generationTaskId,
        output: { generationTaskId: created.generationTaskId, workflowId: created.workflowId ?? null },
      };
    },
  });
  if (deps.context) {
    registry.register({
      id: "file_grant.resolve",
      description: "Resolve an active conversation-scoped uploaded file grant.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: { grantId: { type: "string", minLength: 1 } },
        required: ["grantId"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.context!.resolveFileGrant({
          grantId: String(input.grantId),
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          now: (deps.now ?? (() => new Date()))(),
        }),
      }),
    });
  }
  if (deps.knowledge) {
    registry.register({
      id: "memory.read",
      description: "Read explicit memories scoped to this actor, canvas, and conversation.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async (_input, context) => ({
        status: "succeeded",
        output: {
          memories: await deps.knowledge!.listMemories({
            canvasId: context.canvasId,
            conversationId: context.conversationId,
            actor: context.actor,
          }),
        },
      }),
    });
    registry.register({
      id: "memory.write",
      description: "Persist a small explicit memory after policy approval.",
      effect: "memory_write",
      requiredCapability: "canvas:run",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", minLength: 1 },
          value: { type: "object" },
        },
        required: ["key", "value"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.knowledge!.remember({
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          key: String(input.key),
          value: input.value as Record<string, unknown>,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
          now: (deps.now ?? (() => new Date()))(),
        }),
      }),
    });
    registry.register({
      id: "provider_docs.read",
      description: "Read an administrator-curated provider document and return a persisted citation.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: {
          providerName: { type: "string", minLength: 1 },
          documentKey: { type: "string", minLength: 1 },
          query: { type: "string" },
        },
        required: ["providerName", "documentKey"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.knowledge!.readProviderDocument({
          providerName: String(input.providerName),
          documentKey: String(input.documentKey),
          query: typeof input.query === "string" ? input.query : null,
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          actor: context.actor,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
          now: (deps.now ?? (() => new Date()))(),
        }),
      }),
    });
  }
  if (deps.promptPreferences) {
    registry.register({
      id: "preference.read_media_prompt",
      description: "Read this actor's explicitly confirmed media prompt preferences across authorized Canvases.",
      effect: "read",
      requiredCapability: "canvas:view",
      inputSchema: {
        type: "object",
        properties: { mediaKind: { type: "string", enum: ["image", "video", "audio"] } },
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: {
          preferences: await deps.promptPreferences!.list({
            canvasId: context.canvasId,
            actor: context.actor,
            mediaKind: input.mediaKind as "image" | "video" | "audio" | undefined,
            limit: 100,
          }),
        },
      }),
    });
    registry.register({
      id: "preference.learn_media_prompt",
      description: "Persist a media prompt preference only after the user explicitly confirms the pending approval.",
      effect: "memory_write",
      requiredCapability: "canvas:run",
      inputSchema: {
        type: "object",
        properties: {
          mediaKind: { type: "string", enum: ["image", "video", "audio"] },
          preferenceKey: { type: "string", minLength: 1 },
          instruction: { type: "string", minLength: 1 },
          tags: { type: "array", items: { type: "string", minLength: 1 } },
          confirmed: { type: "boolean", enum: [true] },
        },
        required: ["mediaKind", "instruction", "confirmed"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.promptPreferences!.learn({
          canvasId: context.canvasId,
          conversationId: context.conversationId,
          taskId: context.agentTaskId,
          stepId: context.agentStepId,
          actor: context.actor,
          mediaKind: input.mediaKind as "image" | "video" | "audio",
          preferenceKey: typeof input.preferenceKey === "string" ? input.preferenceKey : undefined,
          instruction: String(input.instruction),
          tags: input.tags,
          confirmed: input.confirmed === true,
          now: (deps.now ?? (() => new Date()))(),
        }),
      }),
    });
    registry.register({
      id: "preference.forget_media_prompt",
      description: "Revoke an explicitly stored media prompt preference after approval.",
      effect: "memory_write",
      requiredCapability: "canvas:run",
      inputSchema: {
        type: "object",
        properties: { preferenceId: { type: "string", minLength: 1 } },
        required: ["preferenceId"],
        additionalProperties: false,
      },
      execute: async (input, context) => ({
        status: "succeeded",
        output: await deps.promptPreferences!.revoke({
          canvasId: context.canvasId,
          actor: context.actor,
          preferenceId: String(input.preferenceId),
          now: (deps.now ?? (() => new Date()))(),
        }),
      }),
    });
  }
  return registry;
}

function analyzeCanvasStructure(canvas: Record<string, unknown>) {
  const document = readRecord(canvas.document) ?? canvas;
  const nodes = Array.isArray(document.nodes) ? document.nodes.map(readRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const edges = Array.isArray(document.edges) ? document.edges.map(readRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const connected = new Set<string>();
  for (const edge of edges) {
    const source = readStringValue(edge.sourceNodeId ?? edge.source);
    const target = readStringValue(edge.targetNodeId ?? edge.target);
    if (source) connected.add(source);
    if (target) connected.add(target);
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes: countBy(nodes, (node) => readStringValue(node.type) || "unknown"),
    edgeKinds: countBy(edges, (edge) => readStringValue(edge.kind) || "execution"),
    isolatedNodeIds: nodes.map((node) => readStringValue(node.id)).filter((id) => id && !connected.has(id)),
  };
}

function analyzeCanvasWorkflowRisks(canvas: Record<string, unknown>) {
  const document = readRecord(canvas.document) ?? canvas;
  const nodes = Array.isArray(document.nodes) ? document.nodes.map(readRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const edges = Array.isArray(document.edges) ? document.edges.map(readRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const nodeIds = new Set(nodes.map((node) => readStringValue(node.id)).filter(Boolean));
  const executionEdges = edges.filter((edge) => !readStringValue(edge.kind) || readStringValue(edge.kind) === "execution");
  const missingEndpoints = executionEdges.filter((edge) => {
    const source = readStringValue(edge.sourceNodeId ?? edge.source);
    const target = readStringValue(edge.targetNodeId ?? edge.target);
    return !source || !target || !nodeIds.has(source) || !nodeIds.has(target);
  }).map((edge) => readStringValue(edge.id) || "unknown");
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodeIds) adjacency.set(nodeId, []);
  for (const edge of executionEdges) {
    const source = readStringValue(edge.sourceNodeId ?? edge.source);
    const target = readStringValue(edge.targetNodeId ?? edge.target);
    if (source && target && adjacency.has(source) && adjacency.has(target)) adjacency.get(source)!.push(target);
  }
  const cycleNodeIds = findCycleNodes(adjacency);
  const unconfiguredGenerationNodeIds = nodes.filter((node) => {
    const type = readStringValue(node.type);
    if (!type.startsWith("ai-")) return false;
    const data = readRecord(node.data) ?? {};
    return !readStringValue(data.prompt ?? data.text) || !readStringValue(data.modelCode ?? data.model);
  }).map((node) => readStringValue(node.id)).filter(Boolean);
  return {
    riskCount: missingEndpoints.length + cycleNodeIds.length + unconfiguredGenerationNodeIds.length,
    missingEndpointEdgeIds: missingEndpoints,
    cycleNodeIds,
    unconfiguredGenerationNodeIds,
  };
}

function analyzeCanvasAssetReuse(value: Record<string, unknown>) {
  const items = Array.isArray(value.items) ? value.items.map(readRecord).filter(Boolean) as Record<string, unknown>[]
    : Array.isArray(value.assets) ? value.assets.map(readRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const artifacts = Array.isArray(item.artifacts) ? item.artifacts.map(readRecord).filter(Boolean) as Record<string, unknown>[] : [item];
    for (const artifact of artifacts) {
      const stableKey = readStringValue(artifact.assetVersionId ?? artifact.storageObjectId ?? artifact.assetId);
      const artifactId = readStringValue(artifact.artifactId ?? artifact.id);
      if (!stableKey || !artifactId) continue;
      const ids = groups.get(stableKey) ?? [];
      ids.push(artifactId);
      groups.set(stableKey, ids);
    }
  }
  return {
    reusable: [...groups.entries()].map(([stableKey, artifactIds]) => ({ stableKey, artifactIds })),
    duplicateGroups: [...groups.entries()]
      .filter(([, artifactIds]) => artifactIds.length > 1)
      .map(([stableKey, artifactIds]) => ({ stableKey, artifactIds })),
  };
}

function countBy(items: Record<string, unknown>[], keyFor: (item: Record<string, unknown>) => string) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right)));
}

function findCycleNodes(adjacency: Map<string, string[]>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycle = new Set<string>();
  const walk = (nodeId: string, path: string[]) => {
    if (visiting.has(nodeId)) {
      const start = path.indexOf(nodeId);
      path.slice(start).forEach((item) => cycle.add(item));
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) walk(next, [...path, nodeId]);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  adjacency.forEach((_value, nodeId) => walk(nodeId, []));
  return [...cycle].sort();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateSchema(
  schema: CanvasAgentJsonSchema,
  value: unknown,
  path: string,
  errors: string[],
) {
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path}:enum`);
    return;
  }
  if (!schema.type) return;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}:object`);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) errors.push(`${path}.${required}:required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!schema.properties?.[key]) errors.push(`${path}.${key}:additional`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in record) validateSchema(child, record[key], `${path}.${key}`, errors);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}:array`);
      return;
    }
    value.forEach((item, index) => schema.items && validateSchema(schema.items, item, `${path}[${index}]`, errors));
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") errors.push(`${path}:string`);
    else if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}:minLength`);
    return;
  }
  if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${path}:boolean`);
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) errors.push(`${path}:number`);
  if (schema.type === "integer" && !Number.isInteger(value)) errors.push(`${path}:integer`);
  if ((schema.type === "number" || schema.type === "integer") && schema.minimum !== undefined && Number(value) < schema.minimum) {
    errors.push(`${path}:minimum`);
  }
}
