import type {
  CanvasAgentActor,
  CanvasAgentMode,
  CanvasAgentToolEffect,
} from "./canvas-agent.types.ts";

export type CanvasAgentPolicyDecision =
  | { decision: "allow"; reason: string }
  | { decision: "require_approval"; reason: string }
  | { decision: "deny"; reason: string };

export interface CanvasAgentPolicySettings {
  allowAutomaticCanvasWrites?: boolean;
  allowAutomaticAssetWrites?: boolean;
  allowAutomaticMediaGeneration?: boolean;
  webSearchProviderAllowlist?: string[];
  mcpServerAllowlist?: string[];
}

export class CanvasAgentPolicyService {
  constructor(private readonly settings: CanvasAgentPolicySettings = {}) {}

  evaluate(input: {
    mode: CanvasAgentMode;
    actor: CanvasAgentActor;
    effect: CanvasAgentToolEffect;
    requiredCapability: string;
    providerId?: string | null;
    mcpServerId?: string | null;
  }): CanvasAgentPolicyDecision {
    if (input.mode === "expert" && input.effect !== "read") {
      return { decision: "deny", reason: "expert_mode_read_only" };
    }
    if (input.mode === "plan" && input.effect !== "read") {
      return { decision: "deny", reason: "plan_mode_read_only" };
    }
    if (!input.actor.capabilities.has(input.requiredCapability)) {
      return { decision: "deny", reason: `missing_capability:${input.requiredCapability}` };
    }
    if (input.effect === "read") {
      return { decision: "allow", reason: "read_only" };
    }
    if (input.effect === "external_network") {
      if (!input.providerId || !this.settings.webSearchProviderAllowlist?.includes(input.providerId)) {
        return { decision: "deny", reason: "web_provider_not_allowed" };
      }
      return { decision: "require_approval", reason: "external_network" };
    }
    if (input.effect === "mcp") {
      if (!input.mcpServerId || !this.settings.mcpServerAllowlist?.includes(input.mcpServerId)) {
        return { decision: "deny", reason: "mcp_server_not_allowed" };
      }
      return { decision: "require_approval", reason: "mcp_side_effect_boundary" };
    }
    if (input.mode === "b") {
      return { decision: "require_approval", reason: `${input.mode}_mode_effect` };
    }
    if (input.effect === "canvas_write" && this.settings.allowAutomaticCanvasWrites === true) {
      return { decision: "allow", reason: "canvas_write_policy" };
    }
    if (input.effect === "asset_write" && this.settings.allowAutomaticAssetWrites === true) {
      return { decision: "allow", reason: "asset_write_policy" };
    }
    if (input.effect === "media_generation" && this.settings.allowAutomaticMediaGeneration === true) {
      return { decision: "allow", reason: "media_generation_policy" };
    }
    return { decision: "require_approval", reason: `${input.effect}_requires_approval` };
  }
}
