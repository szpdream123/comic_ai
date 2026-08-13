import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const createCanvasProjectCommand: ApiCommandContract = {
  name: "CreateCanvasProject",
  operationName: operationNames.canvasProjectCreate,
  capability: capabilities.projectCreate,
  idempotencyRequired: true,
  requestSchema: {
    title: "optional canvas project title",
    status: "optional canvas project status",
  },
  responseSchema: { project: "canvas project summary" },
  resourceScope: "user:{user_id}:canvas_projects",
  statePreconditions: [
    "actor belongs to an active main account",
    "actor can create projects",
  ],
  businessErrors: [
    "team_member_canvas_create_forbidden",
    "idempotency_conflict",
  ],
  auditEvent: "canvas.project.created",
  verificationIds: ["CANVAS-project-create", "IDEMP-canvas-project-create"],
};

export const generateCanvasAudioCommand: ApiCommandContract = {
  name: "GenerateCanvasAudio",
  operationName: operationNames.canvasAudioGenerate,
  capability: capabilities.generationStart,
  idempotencyRequired: true,
  requestSchema: {
    canvasProjectId: "uuid",
    nodeKey: "canvas node id",
    kind: "audio",
    prompt: "optional text",
    model: "optional model code",
    parameters: "optional object",
  },
  responseSchema: {
    workflowId: "uuid",
    taskId: "uuid",
    taskStatus: "task status",
    runId: "uuid",
    runNo: "positive integer",
  },
  resourceScope: "canvas:{canvas_project_id}:node:{node_key}",
  statePreconditions: [
    "actor can run the canvas",
    "node is an audio generation node",
    "credit check passes",
  ],
  businessErrors: [
    "canvas_project_not_found",
    "canvas_node_not_found",
    "canvas_audio_node_invalid",
    "insufficient_credits",
  ],
  auditEvent: "canvas.audio_generation_requested",
  verificationIds: ["CANVAS-audio-generation", "IDEMP-canvas-audio-generation"],
};

export const createToolPresetCommand: ApiCommandContract = {
  name: "CreateToolPreset",
  operationName: operationNames.toolPresetCreate,
  capability: capabilities.accountRead,
  idempotencyRequired: true,
  requestSchema: {
    name: "1-120 chars",
    description: "optional text up to 1000 chars",
    category: "optional text up to 50 chars",
    topology: "canvas tool preset topology",
  },
  responseSchema: { preset: "tool preset detail" },
  resourceScope: "user:{user_id}:tool_presets",
  statePreconditions: [
    "actor belongs to an active main account",
    "tool preset topology is valid",
  ],
  businessErrors: [
    "invalid_tool_preset_name",
    "invalid_tool_preset_topology",
    "tool_preset_name_conflict",
    "idempotency_conflict",
  ],
  auditEvent: "canvas.tool_preset.created",
  verificationIds: ["CANVAS-tool-preset-create", "IDEMP-canvas-tool-preset-create"],
};

export const duplicateToolPresetCommand: ApiCommandContract = {
  name: "DuplicateToolPreset",
  operationName: operationNames.toolPresetDuplicate,
  capability: capabilities.accountRead,
  idempotencyRequired: true,
  requestSchema: {
    presetId: "uuid",
    name: "optional 1-120 chars",
  },
  responseSchema: { preset: "tool preset detail" },
  resourceScope: "user:{user_id}:tool_preset:{preset_id}",
  statePreconditions: [
    "actor belongs to an active main account",
    "source tool preset is active and belongs to the main account",
  ],
  businessErrors: [
    "invalid_tool_preset_id",
    "invalid_tool_preset_name",
    "tool_preset_not_found",
    "tool_preset_version_not_found",
    "tool_preset_name_conflict",
    "idempotency_conflict",
  ],
  auditEvent: "canvas.tool_preset.duplicated",
  verificationIds: ["CANVAS-tool-preset-duplicate", "IDEMP-canvas-tool-preset-duplicate"],
};

export const canvasCommandContracts = [
  createCanvasProjectCommand,
  generateCanvasAudioCommand,
  createToolPresetCommand,
  duplicateToolPresetCommand,
];
