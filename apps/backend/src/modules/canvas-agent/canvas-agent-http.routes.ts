import type { SqlDatabase } from "../shared/db/sql.ts";
import { CanvasAgentContextService } from "./canvas-agent-context.service.ts";
import type { CanvasAgentActor } from "./canvas-agent.types.ts";

export type CanvasAgentFileGrantRoute = {
  canvasId: string;
  conversationId: string;
  grantId: string | null;
};

export function matchCanvasAgentFileGrantRoute(pathname: string): CanvasAgentFileGrantRoute | null {
  const match = pathname.match(
    /^\/api\/canvas\/([^/]+)\/conversations\/([^/]+)\/file-grants(?:\/([^/]+))?$/,
  );
  if (!match) return null;
  return {
    canvasId: decodeURIComponent(match[1] ?? ""),
    conversationId: decodeURIComponent(match[2] ?? ""),
    grantId: match[3] ? decodeURIComponent(match[3]) : null,
  };
}

export function createCanvasAgentFileGrantHttpService(db: SqlDatabase) {
  const context = new CanvasAgentContextService({
    db,
    loadCanvasContext: async () => {
      throw new Error("canvas_agent_file_grant_canvas_context_unavailable");
    },
  });
  return {
    async handle(input: {
      method: string;
      route: CanvasAgentFileGrantRoute;
      actor: CanvasAgentActor;
      body?: Record<string, unknown>;
      includeInactive?: boolean;
      now: Date;
    }): Promise<{ status: number; data: Record<string, unknown> }> {
      if (input.method === "POST" && !input.route.grantId) {
        const expiresInSeconds = clampExpirySeconds(input.body?.expiresInSeconds);
        const grant = await context.createFileGrant({
          canvasId: input.route.canvasId,
          conversationId: input.route.conversationId,
          storageObjectId: String(input.body?.storageObjectId ?? "").trim(),
          purpose: String(input.body?.purpose ?? "").trim(),
          actor: input.actor,
          expiresAt: new Date(input.now.getTime() + expiresInSeconds * 1_000),
          now: input.now,
        });
        return { status: 201, data: { grant: { ...grant, expiresAt: new Date(input.now.getTime() + expiresInSeconds * 1_000).toISOString() } } };
      }
      if (input.method === "GET" && !input.route.grantId) {
        const grants = await context.listFileGrants({
          canvasId: input.route.canvasId,
          conversationId: input.route.conversationId,
          actor: input.actor,
          includeInactive: input.includeInactive,
          now: input.now,
        });
        return { status: 200, data: { grants } };
      }
      if (input.method === "DELETE" && input.route.grantId) {
        const revoked = await context.revokeFileGrant({
          grantId: input.route.grantId,
          canvasId: input.route.canvasId,
          conversationId: input.route.conversationId,
          actor: input.actor,
          now: input.now,
        });
        if (!revoked) throw new Error("canvas_agent_file_grant_not_found");
        return { status: 200, data: { revokedGrantId: input.route.grantId } };
      }
      throw new Error("method_not_allowed");
    },
  };
}

function clampExpirySeconds(value: unknown) {
  const parsed = Number(value ?? 3_600);
  if (!Number.isFinite(parsed)) throw new Error("canvas_agent_file_grant_expiry_invalid");
  return Math.min(86_400, Math.max(60, Math.trunc(parsed)));
}

export const __canvasAgentHttpRouteTestUtils = { clampExpirySeconds };
