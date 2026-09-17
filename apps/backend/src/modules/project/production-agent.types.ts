import type { AiStoryboardPromptStage } from "../ai-storyboard/ai-storyboard-preview.service.ts";

export const productionAgentType = "production" as const;
export const productionAgentWorkflowType = "production_agent" as const;
export const productionAgentTaskType = "production_agent.execute" as const;

export type ProductionAgentStage = AiStoryboardPromptStage;

export interface ProductionAgentScope {
  projectId: string;
  ownerUserId: string;
  actorTeamMemberId?: string | null;
}

export interface ProductionAgentInput {
  scriptText: string;
  modelCode?: string | null;
  instruction?: string | null;
  resolveInstructionIntent?: boolean;
  skipScriptStage?: boolean;
  stages?: ProductionAgentStage[] | null;
  skillId?: string | null;
  skills?: Partial<Record<"script" | "shot" | "prop_extract" | "character_extract" | "scene_extract", string | null>> | null;
  plazaSkillId?: string | null;
  plazaSkillIds?: string[] | null;
  packages?: {
    genrePackageId?: string | null;
    emotionPackageId?: string | null;
  } | null;
  context?: {
    scenes?: Array<Record<string, unknown>> | null;
    characters?: Array<Record<string, unknown>> | null;
    props?: Array<Record<string, unknown>> | null;
  } | null;
}

export interface ProductionManifest {
  schemaVersion: "creator-production.v1";
  revision?: ProductionManifestRevision;
  source: { kind: "novel" | "script" | "text"; contentHash?: string };
  project: { projectId: string };
  scriptText: string;
  scenes: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  props: Array<Record<string, unknown>>;
  storyboards: Array<Record<string, unknown>>;
}

export interface ProductionManifestRevision {
  version: number;
  hash: string;
  parentHash: string | null;
}
