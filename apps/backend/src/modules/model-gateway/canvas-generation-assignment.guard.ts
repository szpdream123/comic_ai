import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export class CanvasGenerationAssignmentRevokedError extends Error {
  readonly code = "canvas_assignment_revoked";
  readonly failureCode = "canvas_assignment_revoked";

  constructor() {
    super("Canvas assignment is no longer active.");
  }
}

export async function assertCanvasGenerationAssignmentActive(
  db: SqlDatabase,
  snapshot: Record<string, unknown>,
) {
  const canvasProjectId = readString(snapshot.canvasProjectId);
  const teamMemberId = readString(snapshot.teamMemberId ?? snapshot.memberId);
  if (!canvasProjectId) return;

  const active = await queryOne<{ allowed: boolean }>(
    db,
    teamMemberId
      ? `
          SELECT true AS allowed
          FROM team_members member
          JOIN users owner
            ON owner.id = member.user_id
           AND owner.status = 'active'
          JOIN team_member_canvases assignment
            ON assignment.member_id = member.id
           AND assignment.user_id = member.user_id
           AND assignment.canvas_id = $1
          JOIN creator_canvas_projects canvas
            ON canvas.id = assignment.canvas_id
           AND canvas.created_by_user_id = member.user_id
           AND canvas.deleted_at IS NULL
          WHERE member.id = $2
            AND member.status = 'active'
            AND member.deleted_at IS NULL
          LIMIT 1
        `
      : `
          SELECT true AS allowed
          FROM creator_canvas_projects canvas
          JOIN users owner
            ON owner.id = canvas.created_by_user_id
           AND owner.status = 'active'
          WHERE canvas.id = $1
            AND canvas.deleted_at IS NULL
          LIMIT 1
        `,
    teamMemberId ? [canvasProjectId, teamMemberId] : [canvasProjectId],
  );
  if (!active) throw new CanvasGenerationAssignmentRevokedError();
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
