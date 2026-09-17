import { createHash } from "node:crypto";
import {
  createAiStoryboardPreviewService,
  resolveAiStoryboardWorkflowIntent,
  type AiStoryboardPreviewInput,
  type TextChatGatewayLike,
} from "../ai-storyboard/ai-storyboard-preview.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { IdempotencyConflictError } from "../shared/idempotency/idempotency.service.ts";
import {
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import type { ProductionAgentInput, ProductionAgentScope, ProductionManifest } from "./production-agent.types.ts";
import { productionAgentTaskType, productionAgentType, productionAgentWorkflowType } from "./production-agent.types.ts";
import { versionProductionManifest } from "./production-agent.manifest-version.ts";
import { validateProductionManifest } from "./production-agent.validator.ts";

export interface ProductionAgentAdapterDeps {
  gateway: TextChatGatewayLike;
  resolvePreviewInput: (input: ProductionAgentInput & ProductionAgentScope) => Promise<AiStoryboardPreviewInput>;
}

export function createProductionAgentAdapter(deps: ProductionAgentAdapterDeps) {
  const previewService = createAiStoryboardPreviewService({ gateway: deps.gateway });

  async function resolveStages(input: ProductionAgentInput & ProductionAgentScope) {
    const previewInput = await deps.resolvePreviewInput(input);
    const modelCode = String(previewInput.modelCode ?? "deepseek-script").trim();
    if (input.resolveInstructionIntent === true) {
      const instruction = String(input.instruction ?? "").trim();
      if (!instruction) throw new Error("production_agent_instruction_required");
      return resolveAiStoryboardWorkflowIntent({
        gateway: deps.gateway,
        modelCode,
        instruction,
        projectId: input.projectId,
        createdByUserId: input.ownerUserId,
      });
    }
    return {
      stages: input.stages ?? null,
      skipScriptStage: input.skipScriptStage === true,
    };
  }

  async function generate(input: ProductionAgentInput & ProductionAgentScope) {
    const previewInput = await deps.resolvePreviewInput(input);
    const intent = await resolveStages(input);
    const preview = await previewService.generatePreview({
      ...previewInput,
      ...(intent.stages ? { selectedStages: intent.stages } : {}),
      skipScriptStage: intent.skipScriptStage,
    });
    const manifest = createProductionManifest(input, preview);
    const validation = validateProductionManifest(manifest);
    if (!validation.valid) {
      const error = new Error("production_agent_manifest_invalid");
      Object.assign(error, { validationErrors: validation.errors });
      throw error;
    }
    return { intent, preview, manifest };
  }

  return { generate, resolveStages };
}

export function createProductionManifest(
  input: Pick<ProductionAgentScope, "projectId">,
  preview: Record<string, unknown>,
): ProductionManifest {
  const payload = (preview.commitPayload ?? {}) as Record<string, unknown>;
  const scriptText = String(payload.scriptText ?? preview.scriptText ?? "");
  const scenes = withStableAssetKeys("scene", records(payload.scenes));
  const characters = withStableAssetKeys("character", records(payload.characters));
  const props = withStableAssetKeys("prop", records(payload.props));
  return versionProductionManifest({
    schemaVersion: "creator-production.v1",
    source: {
      kind: detectSourceKind(scriptText),
      contentHash: createHash("sha256").update(scriptText).digest("hex"),
    },
    project: { projectId: input.projectId },
    scriptText,
    scenes,
    characters,
    props,
    storyboards: withStableStoryboardAssetKeys(records(payload.storyboards), {
      scenes,
      characters,
      props,
    }),
  });
}

export interface ProductionAgentExecution {
  workflowId: string;
  taskId: string;
  attemptId: string | null;
  projectId: string;
  finished: boolean;
}

export async function createOrReuseProductionAgentExecution(
  db: SqlDatabase,
  input: {
    userId: string;
    projectId: string;
    teamMemberId?: string | null;
    idempotencyKey: string;
    requestFingerprint?: string;
    stages: readonly string[];
    leaseMs: number;
    now: Date;
  },
): Promise<ProductionAgentExecution> {
  let workflowId: string;
  let taskId: string;
  let taskStatus: string;
  let currentAttemptId: string | null;
  await db.query("BEGIN");
  try {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`production-agent:${input.userId}:${input.projectId}:${input.idempotencyKey}`],
    );
    const existing = await queryOne<{
      workflow_id: string;
      task_id: string;
      task_status: string;
      current_attempt_id: string | null;
      request_fingerprint: string | null;
    }>(
      db,
      `
        SELECT workflow.id AS workflow_id,
               task.id AS task_id,
               task.status AS task_status,
               task.current_attempt_id,
               workflow.input_snapshot_json->>'requestFingerprint' AS request_fingerprint
        FROM workflows workflow
        JOIN tasks task ON task.workflow_id = workflow.id
        WHERE workflow.created_by_user_id = $1
          AND workflow.project_id = $2
          AND workflow.workflow_type = $3
          AND task.task_type = $4
          AND (
            workflow.idempotency_key = $5
            OR workflow.input_snapshot_json->>'idempotencyKey' = $5
          )
        ORDER BY workflow.created_at ASC
        LIMIT 1
        FOR UPDATE OF workflow, task
      `,
      [input.userId, input.projectId, productionAgentWorkflowType, productionAgentTaskType, input.idempotencyKey],
    );
    if (existing) {
      await assertProductionAgentTaskRoute(db, {
        taskId: existing.task_id,
        projectId: input.projectId,
      });
      if (input.requestFingerprint && existing.request_fingerprint !== input.requestFingerprint) {
        throw new IdempotencyConflictError();
      }
      workflowId = existing.workflow_id;
      taskId = existing.task_id;
      taskStatus = existing.task_status;
      currentAttemptId = existing.current_attempt_id;
      if (taskStatus === "failed" || taskStatus === "canceled") {
        await db.query(
          `
            UPDATE tasks
            SET status = 'queued',
                current_attempt_id = NULL,
                failure_code = NULL,
                max_attempts = GREATEST(max_attempts, attempt_count + 1),
                updated_at = $2
            WHERE id = $1
          `,
          [taskId, input.now],
        );
        await db.query(
          `
            UPDATE workflows
            SET status = 'queued',
                finished_at = NULL,
                failure_code = NULL,
                failure_message = NULL,
                updated_at = $2
            WHERE id = $1
          `,
          [workflowId, input.now],
        );
        taskStatus = "queued";
        currentAttemptId = null;
      }
    } else {
      const created = await createWorkflowWithTasks(db, {
        userId: input.userId,
        projectId: input.projectId,
        workflowType: productionAgentWorkflowType,
        inputSnapshot: {
          agentType: productionAgentType,
          scopeType: "project",
          scopeId: input.projectId,
          source: "ai_storyboard_preview",
          stages: [...input.stages],
          teamMemberId: input.teamMemberId ?? null,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint ?? null,
        },
        tasks: [{
          taskType: productionAgentTaskType,
          queueName: "task-center",
          targetEntityType: "project",
          targetEntityId: input.projectId,
          inputSnapshot: {
            agentType: productionAgentType,
            scopeType: "project",
            scopeId: input.projectId,
            source: "ai_storyboard_preview",
            stages: [...input.stages],
            teamMemberId: input.teamMemberId ?? null,
            requestFingerprint: input.requestFingerprint ?? null,
          },
        }],
      });
      workflowId = created.workflow.id;
      taskId = created.tasks[0]!.id;
      taskStatus = created.tasks[0]!.status;
      currentAttemptId = null;
      await db.query("UPDATE workflows SET idempotency_key = $2 WHERE id = $1", [workflowId, input.idempotencyKey]);
      await db.query("UPDATE tasks SET idempotency_key = $2 WHERE id = $1", [taskId, input.idempotencyKey]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  if (taskStatus !== "queued") {
    return { workflowId, taskId, attemptId: currentAttemptId, projectId: input.projectId, finished: true };
  }
  const claim = await claimProductionAgentTask(db, {
    taskId,
    projectId: input.projectId,
    workerId: "production-agent-http",
    now: input.now,
    leaseMs: input.leaseMs,
  });
  if (claim) {
    return { workflowId, taskId, attemptId: claim.attempt.id, projectId: input.projectId, finished: false };
  }
  return { workflowId, taskId, attemptId: null, projectId: input.projectId, finished: true };
}

export async function claimProductionAgentTask(
  db: SqlDatabase,
  input: { taskId: string; projectId: string; workerId: string; now: Date; leaseMs: number },
) {
  await assertProductionAgentTaskRoute(db, input);
  return claimQueuedTask(db, input);
}

export async function finalizeProductionAgentTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    projectId: string;
    status: "succeeded" | "failed" | "canceled";
    failureCode?: string | null;
    now: Date;
  },
) {
  await assertProductionAgentTaskRoute(db, input);
  return finalizeTaskAttempt(db, input);
}

async function assertProductionAgentTaskRoute(
  db: SqlDatabase,
  input: { taskId: string; projectId: string },
) {
  const routed = await queryOne<{ id: string }>(
    db,
    `
      SELECT task.id
      FROM tasks task
      JOIN workflows workflow ON workflow.id = task.workflow_id
      WHERE task.id = $1
        AND workflow.project_id = $2
        AND task.project_id = $2
        AND workflow.canvas_project_id IS NULL
        AND task.canvas_project_id IS NULL
        AND workflow.workflow_type = $3
        AND task.task_type = $4
        AND task.queue_name = 'task-center'
        AND task.target_entity_type = 'project'
        AND task.target_entity_id::text = $2::text
        AND workflow.input_snapshot_json->>'agentType' = $5
        AND workflow.input_snapshot_json->>'scopeType' = 'project'
        AND workflow.input_snapshot_json->>'scopeId' = $2::text
        AND task.input_snapshot_json->>'agentType' = $5
        AND task.input_snapshot_json->>'scopeType' = 'project'
        AND task.input_snapshot_json->>'scopeId' = $2::text
      LIMIT 1
    `,
    [input.taskId, input.projectId, productionAgentWorkflowType, productionAgentTaskType, productionAgentType],
  );
  if (!routed) throw new Error("production_agent_task_route_mismatch");
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function withStableAssetKeys(
  kind: "character" | "scene" | "prop",
  items: Array<Record<string, unknown>>,
) {
  const used = new Set<string>();
  return items.map((item, index) => {
    const configured = String(item.key ?? "").trim();
    const name = String(
      item.name
      ?? item[`${kind}Name`]
      ?? item[`${kind}_name`]
      ?? "",
    ).trim();
    const base = configured || `${kind}_${stableKeyToken(name || String(index + 1))}`;
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(key);
    return { ...item, key };
  });
}

function withStableStoryboardAssetKeys(
  storyboards: Array<Record<string, unknown>>,
  assets: {
    scenes: Array<Record<string, unknown>>;
    characters: Array<Record<string, unknown>>;
    props: Array<Record<string, unknown>>;
  },
) {
  const sceneIndex = stableAssetKeyIndex(assets.scenes, ["sceneId", "sceneName", "scene_name", "name"]);
  const characterIndex = stableAssetKeyIndex(assets.characters, ["characterId", "characterName", "character_name", "name"]);
  const propIndex = stableAssetKeyIndex(assets.props, ["propId", "propName", "prop_name", "name"]);
  return storyboards.map((storyboard) => ({
    ...storyboard,
    ...(!String(storyboard.sceneKey ?? "").trim()
      ? { sceneKey: firstStableAssetKey([storyboard.sceneId, storyboard.sceneName, storyboard.scene], sceneIndex) }
      : {}),
    ...(!Array.isArray(storyboard.characterKeys)
      ? {
          characterKeys: stableAssetKeys(
            [storyboard.characterIds, storyboard.characterNames, storyboard.characters, storyboard.characterRefs],
            characterIndex,
          ),
        }
      : {}),
    ...(!Array.isArray(storyboard.propKeys)
      ? {
          propKeys: stableAssetKeys(
            [storyboard.propIds, storyboard.propNames, storyboard.props, storyboard.propRefs],
            propIndex,
          ),
        }
      : {}),
  }));
}

function stableAssetKeyIndex(items: Array<Record<string, unknown>>, aliases: string[]) {
  const index = new Map<string, string>();
  for (const item of items) {
    const key = String(item.key ?? "").trim();
    if (!key) continue;
    index.set(normalizeAssetReference(key), key);
    for (const alias of aliases) {
      const value = String(item[alias] ?? "").trim();
      if (value) index.set(normalizeAssetReference(value), key);
    }
  }
  return index;
}

function firstStableAssetKey(values: unknown[], index: Map<string, string>) {
  return stableAssetKeys(values, index)[0];
}

function stableAssetKeys(values: unknown[], index: Map<string, string>) {
  const keys = new Set<string>();
  for (const reference of values.flatMap(assetReferenceValues)) {
    const key = index.get(normalizeAssetReference(reference));
    if (key) keys.add(key);
  }
  return [...keys];
}

function assetReferenceValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(assetReferenceValues);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record.key,
      record.id,
      record.sceneId,
      record.sceneName,
      record.characterId,
      record.characterName,
      record.propId,
      record.propName,
      record.name,
    ].flatMap(assetReferenceValues);
  }
  if (typeof value !== "string" && typeof value !== "number") return [];
  return String(value).split(/[，,、]/u).map((item) => item.trim()).filter(Boolean);
}

function normalizeAssetReference(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function stableKeyToken(value: string) {
  const readable = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return readable || createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function detectSourceKind(scriptText: string): "novel" | "script" | "text" {
  if (/场景|镜头|对白|人物动作|内景|外景/.test(scriptText)) return "script";
  return scriptText.trim() ? "novel" : "text";
}
