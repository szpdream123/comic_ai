import { createHash } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  productionAgentTaskType,
  productionAgentType,
  productionAgentWorkflowType,
  type ProductionManifest,
  type ProductionManifestRevision,
} from "./production-agent.types.ts";

const manifestHashPattern = /^sha256:[a-f0-9]{64}$/;

export function hashProductionManifest(manifest: Omit<ProductionManifest, "revision"> | ProductionManifest) {
  const { revision: _revision, ...content } = manifest as ProductionManifest;
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(content)))
    .digest("hex")}`;
}

export function versionProductionManifest(
  manifest: Omit<ProductionManifest, "revision"> | ProductionManifest,
  input: { version?: number; parentHash?: string | null } = {},
): ProductionManifest {
  const { revision: _revision, ...content } = manifest as ProductionManifest;
  return {
    ...content,
    revision: {
      version: input.version ?? 1,
      hash: hashProductionManifest(content as Omit<ProductionManifest, "revision">),
      parentHash: input.parentHash ?? null,
    },
  } as ProductionManifest;
}

export function validateProductionManifestRevision(manifest: ProductionManifest) {
  const revision = manifest.revision;
  if (revision == null) return [];
  const errors: string[] = [];
  if (!Number.isInteger(revision.version) || revision.version < 1) {
    errors.push("manifest_version_invalid");
  }
  if (!manifestHashPattern.test(revision.hash)) {
    errors.push("manifest_hash_invalid");
  } else if (revision.hash !== hashProductionManifest(manifest)) {
    errors.push("manifest_hash_mismatch");
  }
  if (revision.parentHash !== null && !manifestHashPattern.test(revision.parentHash)) {
    errors.push("manifest_parent_hash_invalid");
  }
  if (revision.version > 1 && revision.parentHash == null) {
    errors.push("manifest_parent_hash_required");
  }
  return errors;
}

export async function registerProductionManifestRevision(
  db: SqlDatabase,
  input: {
    workflowId: string;
    taskId: string;
    projectId: string;
    manifest: ProductionManifest;
    now: Date;
  },
) {
  const revision = requireRevision(input.manifest);
  const updated = await queryOne<{ id: string }>(
    db,
    `
      UPDATE workflows workflow
      SET input_snapshot_json = jsonb_set(
            workflow.input_snapshot_json,
            '{manifestRevision}',
            $4::jsonb,
            true
          ),
          updated_at = $5
      WHERE workflow.id = $1
        AND workflow.project_id = $3
        AND workflow.canvas_project_id IS NULL
        AND workflow.workflow_type = $6
        AND workflow.input_snapshot_json->>'agentType' = $7
        AND workflow.input_snapshot_json->>'scopeType' = 'project'
        AND workflow.input_snapshot_json->>'scopeId' = $3::text
        AND EXISTS (
          SELECT 1
          FROM tasks task
          WHERE task.id = $2
            AND task.workflow_id = workflow.id
            AND task.project_id = $3
            AND task.canvas_project_id IS NULL
            AND task.task_type = $8
            AND task.queue_name = 'task-center'
            AND task.target_entity_type = 'project'
            AND task.target_entity_id::text = $3::text
            AND task.input_snapshot_json->>'agentType' = $7
            AND task.input_snapshot_json->>'scopeType' = 'project'
            AND task.input_snapshot_json->>'scopeId' = $3::text
        )
        AND (
          workflow.input_snapshot_json->'manifestRevision' IS NULL
          OR (
            workflow.input_snapshot_json->'manifestRevision'->>'version' = $9
            AND workflow.input_snapshot_json->'manifestRevision'->>'hash' = $10
          )
        )
      RETURNING workflow.id
    `,
    [
      input.workflowId,
      input.taskId,
      input.projectId,
      JSON.stringify(revision),
      input.now,
      productionAgentWorkflowType,
      productionAgentType,
      productionAgentTaskType,
      String(revision.version),
      revision.hash,
    ],
  );
  if (!updated) throw new Error("production_manifest_revision_registration_conflict");
}

export async function advanceProductionManifestRevision(
  db: SqlDatabase,
  input: {
    workflowId: string;
    taskId: string;
    projectId: string;
    expectedVersion: number;
    expectedHash: string;
    manifest: ProductionManifest;
    now: Date;
  },
): Promise<"advanced" | "replayed" | "stale" | "route_mismatch"> {
  const revision = requireRevision(input.manifest);
  if (
    !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 1
    || !manifestHashPattern.test(input.expectedHash)
  ) {
    return "stale";
  }
  const sameRevision = revision.version === input.expectedVersion && revision.hash === input.expectedHash;
  const nextRevision = revision.version === input.expectedVersion + 1 && revision.parentHash === input.expectedHash;
  if (!sameRevision && !nextRevision) return "stale";

  const row = await queryOne<{ current_version: string; current_hash: string }>(
    db,
    `
      WITH routed AS (
        SELECT workflow.id,
               workflow.input_snapshot_json->'manifestRevision'->>'version' AS current_version,
               workflow.input_snapshot_json->'manifestRevision'->>'hash' AS current_hash
        FROM workflows workflow
        JOIN tasks task ON task.workflow_id = workflow.id
        WHERE workflow.id = $1
          AND task.id = $2
          AND workflow.project_id = $3
          AND task.project_id = $3
          AND workflow.canvas_project_id IS NULL
          AND task.canvas_project_id IS NULL
          AND workflow.workflow_type = $6
          AND task.task_type = $7
          AND task.queue_name = 'task-center'
          AND task.target_entity_type = 'project'
          AND task.target_entity_id::text = $3::text
          AND workflow.input_snapshot_json->>'agentType' = $8
          AND workflow.input_snapshot_json->>'scopeType' = 'project'
          AND workflow.input_snapshot_json->>'scopeId' = $3::text
          AND task.input_snapshot_json->>'agentType' = $8
          AND task.input_snapshot_json->>'scopeType' = 'project'
          AND task.input_snapshot_json->>'scopeId' = $3::text
      ), updated AS (
        UPDATE workflows workflow
        SET input_snapshot_json = jsonb_set(
              workflow.input_snapshot_json,
              '{manifestRevision}',
              $4::jsonb,
              true
            ),
            updated_at = $5
        FROM routed
        WHERE workflow.id = routed.id
          AND (
            (routed.current_version = $9 AND routed.current_hash = $10)
            OR (routed.current_version = $11 AND routed.current_hash = $12)
          )
        RETURNING routed.current_version, routed.current_hash
      )
      SELECT current_version, current_hash FROM updated
    `,
    [
      input.workflowId,
      input.taskId,
      input.projectId,
      JSON.stringify(revision),
      input.now,
      productionAgentWorkflowType,
      productionAgentTaskType,
      productionAgentType,
      String(input.expectedVersion),
      input.expectedHash,
      String(revision.version),
      revision.hash,
    ],
  );
  if (row) {
    return row.current_version === String(revision.version) && row.current_hash === revision.hash
      ? "replayed"
      : "advanced";
  }

  const routed = await queryOne<{ current_version: string | null; current_hash: string | null }>(
    db,
    `
      SELECT workflow.input_snapshot_json->'manifestRevision'->>'version' AS current_version,
             workflow.input_snapshot_json->'manifestRevision'->>'hash' AS current_hash
      FROM workflows workflow
      JOIN tasks task ON task.workflow_id = workflow.id
      WHERE workflow.id = $1
        AND task.id = $2
        AND workflow.project_id = $3
        AND task.project_id = $3
        AND workflow.canvas_project_id IS NULL
        AND task.canvas_project_id IS NULL
        AND workflow.workflow_type = $4
        AND task.task_type = $5
        AND task.queue_name = 'task-center'
        AND task.target_entity_type = 'project'
        AND task.target_entity_id::text = $3::text
        AND workflow.input_snapshot_json->>'agentType' = $6
        AND workflow.input_snapshot_json->>'scopeType' = 'project'
        AND workflow.input_snapshot_json->>'scopeId' = $3::text
        AND task.input_snapshot_json->>'agentType' = $6
        AND task.input_snapshot_json->>'scopeType' = 'project'
        AND task.input_snapshot_json->>'scopeId' = $3::text
      LIMIT 1
    `,
    [input.workflowId, input.taskId, input.projectId, productionAgentWorkflowType, productionAgentTaskType, productionAgentType],
  );
  return routed ? "stale" : "route_mismatch";
}

function requireRevision(manifest: ProductionManifest): ProductionManifestRevision {
  const errors = validateProductionManifestRevision(manifest);
  if (!manifest.revision || errors.length) {
    const error = new Error("production_manifest_revision_invalid");
    Object.assign(error, { validationErrors: errors });
    throw error;
  }
  return manifest.revision;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }
  return value;
}
