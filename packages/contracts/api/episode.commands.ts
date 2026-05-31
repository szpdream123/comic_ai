import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const generateEpisodeImageCommand: ApiCommandContract = {
  name: "GenerateEpisodeImage",
  operationName: operationNames.episodeImageGenerate,
  capability: capabilities.generationStart,
  idempotencyRequired: true,
  requestSchema: {
    episodeId: "uuid",
    targetType: "episode|storyboard|asset",
    targetId: "uuid",
    prompt: "optional text",
    model: "optional model code",
    parameters: "optional object",
  },
  responseSchema: { workflowId: "uuid", taskId: "uuid", taskStatus: "task status" },
  resourceScope: "episode:{episode_id}",
  statePreconditions: [
    "episode belongs to the actor workspace",
    "target belongs to the episode when supplied",
    "credit check passes",
  ],
  businessErrors: [
    "invalid_generation_target",
    "episode_generation_limit_exceeded",
    "insufficient_credits",
  ],
  auditEvent: "episode.image_generation_requested",
  verificationIds: ["TC-P0-004", "TC-P0-012", "R-016"],
};

export const generateEpisodeVideoCommand: ApiCommandContract = {
  name: "GenerateEpisodeVideo",
  operationName: operationNames.episodeVideoGenerate,
  capability: capabilities.generationStart,
  idempotencyRequired: true,
  requestSchema: {
    episodeId: "uuid",
    targetType: "episode|storyboard|asset",
    targetId: "uuid",
    prompt: "optional text",
    model: "optional model code",
    parameters: "optional object",
  },
  responseSchema: { workflowId: "uuid", taskId: "uuid", taskStatus: "task status" },
  resourceScope: "episode:{episode_id}",
  statePreconditions: [
    "episode belongs to the actor workspace",
    "target belongs to the episode when supplied",
    "credit check passes",
  ],
  businessErrors: [
    "invalid_generation_target",
    "episode_generation_limit_exceeded",
    "insufficient_credits",
  ],
  auditEvent: "episode.video_generation_requested",
  verificationIds: ["TC-P0-006", "R-016"],
};

export const episodeCommandContracts = [
  generateEpisodeImageCommand,
  generateEpisodeVideoCommand,
];
