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
  userId: string;
  sqlState: CreatorSqlState;
}) {
  if (input.sqlState.projectId) {
    return input.sqlState;
  }

  const project = await input.db.query<{
    project_id: string;
  }>(
    `
      SELECT p.id AS project_id
      FROM projects p
      WHERE p.owner_user_id = $1
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
    `,
    [input.userId],
  );
  const row = project.rows[0];
  if (row) {
    input.sqlState.projectId = row.project_id;
    input.sqlState.scriptId = null;
  }

  return input.sqlState;
}
