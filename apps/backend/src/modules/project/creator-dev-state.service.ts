import type { SqlDatabase } from "../shared/db/sql.ts";
import { CreatorDevApp } from "./creator-dev-app.ts";

export interface CreatorSqlState {
  projectId: string | null;
  scriptId: string | null;
}

export function getCreatorDevState(input: {
  userId: string;
  creatorApps: Map<string, CreatorDevApp>;
  creatorSqlStates: Map<string, CreatorSqlState>;
}) {
  const creatorApp = input.creatorApps.get(input.userId) ?? new CreatorDevApp();
  input.creatorApps.set(input.userId, creatorApp);

  const sqlState = input.creatorSqlStates.get(input.userId) ?? {
    projectId: null,
    scriptId: null,
  };
  input.creatorSqlStates.set(input.userId, sqlState);

  return {
    creatorApp,
    sqlState,
  };
}

export async function ensureCreatorSqlState(input: {
  db: SqlDatabase;
  workspaceId: string;
  userId: string;
  sqlState: CreatorSqlState;
}) {
  if (input.sqlState.projectId && input.sqlState.scriptId) {
    return input.sqlState;
  }

  const project = await input.db.query<{
    project_id: string;
    script_id: string | null;
  }>(
    `
      SELECT
        p.id AS project_id,
        (
          SELECT s.id
          FROM scripts s
          WHERE s.project_id = p.id
            AND s.deleted_at IS NULL
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1
        ) AS script_id
      FROM projects p
      WHERE p.workspace_id = $1
        AND p.created_by_user_id = $2
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
    `,
    [input.workspaceId, input.userId],
  );
  const row = project.rows[0];
  if (row) {
    input.sqlState.projectId = row.project_id;
    input.sqlState.scriptId = row.script_id;
  }

  return input.sqlState;
}
