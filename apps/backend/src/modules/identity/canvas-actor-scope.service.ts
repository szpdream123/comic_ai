import {
  capabilities,
  type Capability,
} from "../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { resolveUserActorContext } from "./user-actor-context.service.ts";

export type CanvasAction = "view" | "edit" | "run" | "manage";

export type CanvasCapability =
  | typeof capabilities.canvasView
  | typeof capabilities.canvasEdit
  | typeof capabilities.canvasRun
  | typeof capabilities.canvasManage;

export interface CanvasActorScope {
  canvasId: string;
  ownerUserId: string;
  principal: "owner" | "team_member";
  actorTeamMemberId: string | null;
  principalKey: string;
  capabilities: CanvasCapability[];
}

export class CanvasAuthorizationError extends Error {
  constructor(readonly code: "canvas_not_found" | "capability_missing") {
    super(code);
    this.name = "CanvasAuthorizationError";
  }
}

const actionCapabilities: Record<CanvasAction, CanvasCapability> = {
  view: capabilities.canvasView,
  edit: capabilities.canvasEdit,
  run: capabilities.canvasRun,
  manage: capabilities.canvasManage,
};
const CANVAS_PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function authorizeCanvasActor(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    canvasId: string;
    action: CanvasAction;
    now: Date;
  },
): Promise<CanvasActorScope> {
  const actor = await resolveUserActorContext(db, {
    sessionToken: input.sessionToken,
    now: input.now,
  });
  const canvasId = String(input.canvasId ?? "").trim();
  if (!CANVAS_PROJECT_ID_PATTERN.test(canvasId)) {
    throw new CanvasAuthorizationError("canvas_not_found");
  }
  const canvas = await queryOne<{ id: string; owner_user_id: string }>(
    db,
    actor.teamMember
      ? `
          SELECT canvas.id, canvas.created_by_user_id AS owner_user_id
          FROM creator_canvas_projects canvas
          JOIN users owner
            ON owner.id = canvas.created_by_user_id
           AND owner.status = 'active'
          JOIN team_member_canvases assignment
            ON assignment.canvas_id = canvas.id
           AND assignment.user_id = canvas.created_by_user_id
           AND assignment.member_id = $3
          JOIN team_members member
            ON member.id = assignment.member_id
           AND member.user_id = assignment.user_id
           AND member.status = 'active'
           AND member.deleted_at IS NULL
          WHERE canvas.id = $1
            AND canvas.created_by_user_id = $2
            AND canvas.deleted_at IS NULL
          LIMIT 1
        `
      : `
          SELECT canvas.id, canvas.created_by_user_id AS owner_user_id
          FROM creator_canvas_projects canvas
          JOIN users owner
            ON owner.id = canvas.created_by_user_id
           AND owner.status = 'active'
          WHERE canvas.id = $1
            AND canvas.created_by_user_id = $2
            AND canvas.deleted_at IS NULL
          LIMIT 1
        `,
    actor.teamMember
      ? [canvasId, actor.userId, actor.teamMember.id]
      : [canvasId, actor.userId],
  );
  if (!canvas) {
    throw new CanvasAuthorizationError("canvas_not_found");
  }

  const scope: CanvasActorScope = actor.teamMember
    ? {
        canvasId: canvas.id,
        ownerUserId: canvas.owner_user_id,
        principal: "team_member",
        actorTeamMemberId: actor.teamMember.id,
        principalKey: `member:${actor.teamMember.id}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
      }
    : {
        canvasId: canvas.id,
        ownerUserId: canvas.owner_user_id,
        principal: "owner",
        actorTeamMemberId: null,
        principalKey: `owner:${canvas.owner_user_id}`,
        capabilities: [
          capabilities.canvasView,
          capabilities.canvasEdit,
          capabilities.canvasRun,
          capabilities.canvasManage,
        ],
      };
  assertCanvasActorCapability(scope, actionCapabilities[input.action]);
  return scope;
}

export async function restoreCanvasActorScope(
  db: SqlDatabase,
  input: {
    canvasId: string;
    ownerUserId: string;
    actorTeamMemberId: string | null;
  },
): Promise<CanvasActorScope> {
  const canvas = await queryOne<{ id: string; owner_user_id: string }>(
    db,
    input.actorTeamMemberId
      ? `
          SELECT canvas.id, canvas.created_by_user_id AS owner_user_id
          FROM creator_canvas_projects canvas
          JOIN team_member_canvases assignment
            ON assignment.canvas_id = canvas.id
           AND assignment.user_id = canvas.created_by_user_id
           AND assignment.member_id = $3
          JOIN team_members member
            ON member.id = assignment.member_id
           AND member.user_id = assignment.user_id
           AND member.status = 'active'
           AND member.deleted_at IS NULL
          WHERE canvas.id = $1
            AND canvas.created_by_user_id = $2
            AND canvas.deleted_at IS NULL
          LIMIT 1
        `
      : `
          SELECT id, created_by_user_id AS owner_user_id
          FROM creator_canvas_projects
          WHERE id = $1
            AND created_by_user_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
    input.actorTeamMemberId
      ? [input.canvasId, input.ownerUserId, input.actorTeamMemberId]
      : [input.canvasId, input.ownerUserId],
  );
  if (!canvas) {
    throw new CanvasAuthorizationError("canvas_not_found");
  }
  return input.actorTeamMemberId
    ? {
        canvasId: canvas.id,
        ownerUserId: canvas.owner_user_id,
        principal: "team_member",
        actorTeamMemberId: input.actorTeamMemberId,
        principalKey: `member:${input.actorTeamMemberId}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
      }
    : {
        canvasId: canvas.id,
        ownerUserId: canvas.owner_user_id,
        principal: "owner",
        actorTeamMemberId: null,
        principalKey: `owner:${canvas.owner_user_id}`,
        capabilities: [
          capabilities.canvasView,
          capabilities.canvasEdit,
          capabilities.canvasRun,
          capabilities.canvasManage,
        ],
      };
}

export function assertCanvasActorAction(scope: CanvasActorScope, action: CanvasAction) {
  assertCanvasActorCapability(scope, actionCapabilities[action]);
}

export function assertCanvasActorCapability(scope: CanvasActorScope, capability: Capability) {
  if (!scope.capabilities.includes(capability as CanvasCapability)) {
    throw new CanvasAuthorizationError("capability_missing");
  }
}
