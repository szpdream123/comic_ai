import { randomUUID } from "node:crypto";

import { SqlIdempotencyRecordStore } from "../shared/idempotency/persistent-idempotency.store.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type {
  ProjectAspectRatio,
  ProjectBundle,
  ProjectRecord,
  ProjectResolution,
  ProjectStore,
  ScriptRecord,
  ScriptStatus,
  WorkflowRequestRecord,
} from "./project.service.ts";

interface ProjectRow {
  id: string;
  owner_user_id: string;
  name: string;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  aspect_ratio: ProjectAspectRatio;
  resolution: ProjectResolution;
  project_style_code: string;
  phase: ProjectRecord["phase"];
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProjectSourceDocumentRow {
  id: string;
  project_id: string;
  title: string | null;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  deleted_at: Date | string | null;
  status: ScriptStatus;
  input_text: string;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface WorkflowRequestRow {
  workflow_id: string;
  task_id: string;
  task_status: WorkflowRequestRecord["taskStatus"];
  project_id: string;
  script_id: string;
  operation_name: string;
  created_at: Date | string;
}

export class SqlProjectStore implements ProjectStore {
  readonly idempotency: SqlIdempotencyRecordStore;

  constructor(private readonly db: SqlDatabase) {
    this.idempotency = new SqlIdempotencyRecordStore(db);
  }

  async createProjectWithScript(input: {
    userId: string;
    createdByUserId: string;
    name: string;
    scriptInput: string;
    aspectRatio: ProjectAspectRatio;
    resolution: ProjectResolution;
    projectType: string;
  }): Promise<ProjectBundle> {
    const now = new Date();
    const projectId = randomUUID();
    const sourceDocumentId = randomUUID();

    const project = await queryOne<ProjectRow>(
      this.db,
      `
        INSERT INTO projects (
          id,
          name,
          aspect_ratio,
          resolution,
          project_style_code,
          phase,
          owner_user_id,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'script_input', $6, $6, $7, $7)
        RETURNING *
      `,
      [
        projectId,
        input.name,
        input.aspectRatio,
        input.resolution,
        input.projectType,
        input.createdByUserId,
        now,
      ],
    );
    const script = await queryOne<ProjectSourceDocumentRow>(
      this.db,
      `
        INSERT INTO project_source_documents (
          id,
          project_id,
          status,
          input_text,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'ready', $3, $4, $5, $5)
        RETURNING id, project_id, NULL::text AS title,
          NULL::text AS cover_image_url,
          NULL::uuid AS cover_storage_object_id,
          NULL::timestamptz AS deleted_at,
          status, input_text, created_by_user_id, created_at, updated_at
      `,
      [
        sourceDocumentId,
        projectId,
        input.scriptInput,
        input.createdByUserId,
        now,
      ],
    );

    return {
      project: projectFromRow(project!),
      script: scriptFromRow(script!),
    };
  }

  async findProjectBundle(projectId: string): Promise<ProjectBundle | undefined> {
    const project = await this.findProject(projectId);
    if (!project) {
      return undefined;
    }

    const script = await queryOne<ProjectSourceDocumentRow>(
      this.db,
      `
        SELECT id, project_id, NULL::text AS title,
          NULL::text AS cover_image_url,
          NULL::uuid AS cover_storage_object_id,
          NULL::timestamptz AS deleted_at,
          status, input_text, created_by_user_id, created_at, updated_at
        FROM project_source_documents
        WHERE project_id = $1
        ORDER BY created_at
        LIMIT 1
      `,
      [project.id],
    );

    return script
      ? {
          project,
          script: scriptFromRow(script),
        }
      : undefined;
  }

  async findProject(projectId: string): Promise<ProjectRecord | undefined> {
    const row = await queryOne<ProjectRow>(
      this.db,
      "SELECT * FROM projects WHERE id = $1",
      [projectId],
    );

    return row ? projectFromRow(row) : undefined;
  }

  async findProjectByUser(input: {
    userId: string;
    projectId: string;
  }): Promise<ProjectRecord | undefined> {
    const row = await queryOne<ProjectRow>(
      this.db,
      `
        SELECT *
        FROM projects
        WHERE owner_user_id = $1
          AND id = $2
      `,
      [input.userId, input.projectId],
    );

    return row ? projectFromRow(row) : undefined;
  }

  async findScript(scriptId: string): Promise<ScriptRecord | undefined> {
    const row = await queryOne<ProjectSourceDocumentRow>(
      this.db,
      `SELECT id, project_id, NULL::text AS title,
         NULL::text AS cover_image_url,
         NULL::uuid AS cover_storage_object_id,
         NULL::timestamptz AS deleted_at,
         status, input_text, created_by_user_id, created_at, updated_at
       FROM project_source_documents
       WHERE id = $1`,
      [scriptId],
    );

    return row ? scriptFromRow(row) : undefined;
  }

  async findScriptByUser(input: {
    userId: string;
    scriptId: string;
  }): Promise<ScriptRecord | undefined> {
    const row = await queryOne<ProjectSourceDocumentRow>(
      this.db,
      `
        SELECT document.id, document.project_id, NULL::text AS title,
          NULL::text AS cover_image_url,
          NULL::uuid AS cover_storage_object_id,
          NULL::timestamptz AS deleted_at,
          document.status, document.input_text, document.created_by_user_id,
          document.created_at, document.updated_at
        FROM project_source_documents document
        JOIN projects project ON project.id = document.project_id
        WHERE project.owner_user_id = $1
          AND document.id = $2
      `,
      [input.userId, input.scriptId],
    );

    return row ? scriptFromRow(row) : undefined;
  }

  async updateScript(script: ScriptRecord): Promise<ScriptRecord> {
    const row = await queryOne<ProjectSourceDocumentRow>(
      this.db,
      `
        UPDATE project_source_documents
        SET status = $2,
            input_text = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING id, project_id, NULL::text AS title,
          NULL::text AS cover_image_url,
          NULL::uuid AS cover_storage_object_id,
          NULL::timestamptz AS deleted_at,
          status, input_text, created_by_user_id, created_at, updated_at
      `,
      [script.id, script.status, script.inputText, script.updatedAt],
    );

    return scriptFromRow(row!);
  }

  async saveWorkflowRequest(
    record: WorkflowRequestRecord,
  ): Promise<WorkflowRequestRecord> {
    const row = await queryOne<WorkflowRequestRow>(
      this.db,
      `
        SELECT
          w.id AS workflow_id,
          t.id AS task_id,
          t.status AS task_status,
          w.project_id,
          t.target_entity_id AS script_id,
          w.workflow_type AS operation_name,
          w.created_at
        FROM workflows w
        JOIN tasks t ON t.workflow_id = w.id
        WHERE w.id = $1 AND t.id = $2
        LIMIT 1
      `,
      [record.workflowId, record.taskId],
    );

    return row ? workflowRequestFromRow(row) : record;
  }

  async findWorkflowRequest(
    workflowId: string,
  ): Promise<WorkflowRequestRecord | undefined> {
    const row = await queryOne<WorkflowRequestRow>(
      this.db,
      `
        SELECT
          w.id AS workflow_id,
          t.id AS task_id,
          t.status AS task_status,
          w.project_id,
          t.target_entity_id AS script_id,
          w.workflow_type AS operation_name,
          w.created_at
        FROM workflows w
        JOIN tasks t ON t.workflow_id = w.id
        WHERE w.id = $1
        ORDER BY t.created_at
        LIMIT 1
      `,
      [workflowId],
    );

    return row ? workflowRequestFromRow(row) : undefined;
  }
}

function projectFromRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    userId: row.owner_user_id,
    name: row.name,
    coverImageUrl: row.cover_image_url,
    coverStorageObjectId: row.cover_storage_object_id,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    projectType: row.project_style_code,
    phase: row.phase,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function scriptFromRow(row: ProjectSourceDocumentRow): ScriptRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    coverImageUrl: row.cover_image_url,
    coverStorageObjectId: row.cover_storage_object_id,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    status: row.status,
    inputText: row.input_text,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function workflowRequestFromRow(row: WorkflowRequestRow): WorkflowRequestRecord {
  return {
    workflowId: row.workflow_id,
    taskId: row.task_id,
    taskStatus: row.task_status,
    projectId: row.project_id,
    scriptId: row.script_id,
    operationName: row.operation_name,
    createdAt: new Date(row.created_at),
  };
}
