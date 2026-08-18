import { randomUUID } from "node:crypto";

import { findActiveAiModelDispatchPolicyByModelCode, listActiveAiModelConfigs } from "../../model-catalog/ai-model-config.store.ts";
import { resolveGenerationModelExecution } from "../../model-catalog/generation-model-execution.resolver.ts";
import { createGenerationModelConfigSnapshotForTask, createGenerationProviderRouteIdentity } from "../../model-gateway/generation-model-config-snapshot.ts";
import { appendGenerationTaskCreatedOutboxEvent } from "../../model-gateway/generation-outbox.service.ts";
import { upsertQueuedGenerationTaskSnapshot } from "../../model-gateway/generation-task-snapshot.service.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { createAutomaticMarketingTextPlanner } from "../infrastructure/marketing-text-agent-provider.ts";

type Json = Record<string, unknown> | unknown[];
type GenerationRun = {
  id: string; project_id: string; campaign_id: string; content_type: "image" | "video";
  platform: string; executor_account_ref: string; direction: string; scheduled_at: Date;
  source_snapshot: Json | string; created_by_admin_id: string; owner_user_id: string | null;
  knowledge_document_id: string | null; derived_knowledge_document_id: string | null;
  knowledge_segment_ids_json: Json | string; plan_json: Json | string; generation_task_id: string | null;
  marketing_skill_snapshot_json: Json | string;
  skill_snapshot_json: Json | string;
  media_asset_manifest_json: Json | string; content_variant_id: string | null; publish_job_id: string | null; status: string;
};

export type MarketingGenerationWorkerResult = {
  runId: string;
  status: string;
  failureCode?: string;
};

/**
 * The automatic path is deliberately separate from the review-oriented Agent.
 * It writes only owned project facts to the knowledge base and uses the existing
 * generation queue for media, so no browser publisher or model credential is held here.
 */
export class MarketingGenerationWorker {
  private readonly now: () => Date;

  constructor(private readonly deps: {
    db: SqlDatabase;
    now?: () => Date;
    plan?: (input: { run: GenerationRun; knowledge: string; knowledgeSegmentIds: string[] }) => Promise<{
      output: Json;
      knowledgeSegmentIds: string[];
    }>;
  }) {
    this.now = deps.now ?? (() => new Date());
  }

  async processNext(): Promise<MarketingGenerationWorkerResult | null> {
    const run = await this.claimNext();
    if (!run) return null;
    const locked = await this.deps.db.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`marketing-generation:${run.id}`],
    );
    if (!locked.rows[0]?.locked) return null;
    try {
      if (run.status === "queued" || run.status === "knowledge") return await this.writeKnowledge(run);
      if (run.status === "planning") return await this.createMediaTask(run);
      if (run.status === "generating") return await this.collectMedia(run);
      if (run.status === "scheduled" || run.status === "publishing") return await this.syncPublishStatus(run);
      return { runId: run.id, status: run.status };
    } catch (error) {
      const failureCode = errorCode(error);
      await this.fail(run.id, failureCode);
      return { runId: run.id, status: "failed", failureCode };
    } finally {
      await this.deps.db.query("SELECT pg_advisory_unlock(hashtext($1))", [`marketing-generation:${run.id}`]);
    }
  }

  async processUntilIdle(limit = 20) {
    const results: MarketingGenerationWorkerResult[] = [];
    for (let index = 0; index < Math.max(1, Math.min(100, limit)); index += 1) {
      const result = await this.processNext();
      if (!result) break;
      results.push(result);
    }
    return results;
  }

  private async claimNext(): Promise<GenerationRun | null> {
    const claimed = await this.deps.db.query<GenerationRun>(
      `WITH candidate AS (
         SELECT run.id FROM marketing_generation_runs AS run
         WHERE run.status IN ('queued', 'knowledge', 'planning', 'generating', 'scheduled', 'publishing')
         ORDER BY run.created_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       SELECT run.*, project.owner_user_id
       FROM marketing_generation_runs AS run
       JOIN candidate ON candidate.id = run.id
       JOIN marketing_projects AS project ON project.id = run.project_id`,
    );
    return claimed.rows[0] ?? null;
  }

  private async writeKnowledge(run: GenerationRun): Promise<MarketingGenerationWorkerResult> {
    const existingPlan = recordValue(run.plan_json);
    const existingKnowledgeSegmentIds = stringArray(run.knowledge_segment_ids_json);
    if (run.knowledge_document_id && run.derived_knowledge_document_id && existingKnowledgeSegmentIds.length
      && Object.keys(existingPlan).length) {
      await this.deps.db.query(
        `UPDATE marketing_generation_runs
         SET status = 'plan_ready', failure_code = NULL, updated_at = now()
         WHERE id = $1 AND status IN ('queued', 'knowledge')`,
        [run.id],
      );
      return { runId: run.id, status: "plan_ready" };
    }
    const sourceText = snapshotText(run.source_snapshot);
    if (!sourceText) throw codedError("marketing_generation_source_required");
    const rawDocumentId = run.knowledge_document_id ?? randomUUID();
    const derivedDocumentId = run.derived_knowledge_document_id ?? randomUUID();
    const rawSegmentId = randomUUID();
    const derivedSegmentId = randomUUID();
    const optimized = buildKnowledgeSummary(run.direction, sourceText);
    await this.deps.db.query("BEGIN");
    try {
      if (!run.knowledge_document_id) {
        await this.deps.db.query(
          `INSERT INTO marketing_knowledge_documents (
             id, project_id, title, document_type, authorization_status, version,
             applicable_platforms_json, confidence_score, status, created_by_admin_id, approved_by_admin_id
           ) VALUES ($1, $2, $3, 'project_snapshot', 'owned', $4, $5::jsonb, 90, 'approved', $6, $6)`,
          [rawDocumentId, run.project_id, `项目素材快照 ${run.id.slice(0, 8)}`, `run-${run.id}`, JSON.stringify([run.platform]), run.created_by_admin_id],
        );
        await this.deps.db.query(
          `INSERT INTO marketing_knowledge_segments (id, document_id, sequence_number, content, summary, tags_json)
           VALUES ($1, $2, 1, $3, $4, $5::jsonb)`,
          [rawSegmentId, rawDocumentId, sourceText, sourceText.slice(0, 240), JSON.stringify(["project", "owned"])],
        );
      }
      if (!run.derived_knowledge_document_id) {
        await this.deps.db.query(
          `INSERT INTO marketing_knowledge_documents (
             id, project_id, title, document_type, authorization_status, version,
             applicable_platforms_json, confidence_score, status, created_by_admin_id, approved_by_admin_id
           ) VALUES ($1, $2, $3, 'marketing_optimized', 'owned', $4, $5::jsonb, 80, 'approved', $6, $6)`,
          [derivedDocumentId, run.project_id, `营销知识 ${run.id.slice(0, 8)}`, `run-${run.id}`, JSON.stringify([run.platform]), run.created_by_admin_id],
        );
        await this.deps.db.query(
          `INSERT INTO marketing_knowledge_segments (id, document_id, sequence_number, content, summary, tags_json)
           VALUES ($1, $2, 1, $3, $4, $5::jsonb)`,
          [derivedSegmentId, derivedDocumentId, optimized, optimized.slice(0, 240), JSON.stringify(["marketing", "derived", run.platform])],
        );
        await this.deps.db.query(
          `INSERT INTO marketing_knowledge_lineage (id, source_document_id, derived_document_id, generation_run_id, relationship)
           VALUES ($1, $2, $3, $4, 'model_optimized') ON CONFLICT DO NOTHING`,
          [randomUUID(), rawDocumentId, derivedDocumentId, run.id],
        );
      } else {
        await this.deps.db.query(
          `UPDATE marketing_knowledge_segments
           SET content = $2, summary = $3
           WHERE document_id = $1 AND sequence_number = 1`,
          [derivedDocumentId, optimized, optimized.slice(0, 240)],
        );
      }
      const baseKnowledgeSegmentIds = run.knowledge_document_id && run.derived_knowledge_document_id
        ? stringArray(run.knowledge_segment_ids_json)
        : [rawSegmentId, derivedSegmentId];
      const baseKnowledge = await this.loadKnowledgeSegments(baseKnowledgeSegmentIds);
      const reusableKnowledge = await this.loadReusableKnowledge(run, `${run.direction}\n${sourceText}\n${optimized}`, [rawDocumentId, derivedDocumentId]);
      const knowledge = uniqueKnowledgeSegments([...baseKnowledge, ...reusableKnowledge]);
      const knowledgeSegmentIds = knowledge.map((segment) => segment.id);
      const plan = await this.createPlan(run, knowledge.map((segment) => segment.content).join("\n\n"), knowledgeSegmentIds, knowledge);
      await this.deps.db.query(
        `UPDATE marketing_generation_runs
         SET knowledge_document_id = $2, derived_knowledge_document_id = $3,
             knowledge_segment_ids_json = $4::jsonb, plan_json = $5::jsonb,
             status = 'plan_ready', updated_at = now()
         WHERE id = $1 AND status IN ('queued', 'knowledge')`,
        [run.id, rawDocumentId, derivedDocumentId, JSON.stringify(knowledgeSegmentIds), JSON.stringify(plan)],
      );
      await this.deps.db.query("COMMIT");
      return { runId: run.id, status: "plan_ready" };
    } catch (error) {
      await this.deps.db.query("ROLLBACK");
      throw error;
    }
  }

  private async createMediaTask(run: GenerationRun): Promise<MarketingGenerationWorkerResult> {
    if (!run.owner_user_id) throw codedError("marketing_generation_owner_required");
    const kind = run.content_type;
    const selectedModelCode = selectedMarketingModelCode(run.source_snapshot);
    const activeModels = await listActiveAiModelConfigs(this.deps.db, { mediaType: kind });
    const model = selectedModelCode
      ? activeModels.find((candidate) => candidate.modelCode === selectedModelCode)
      : activeModels[0];
    if (!model) throw codedError("marketing_generation_model_unavailable");
    const policy = await findActiveAiModelDispatchPolicyByModelCode(this.deps.db, model.modelCode);
    const execution = resolveGenerationModelExecution({
      kind, modelCode: model.modelCode, modelConfig: model, dispatchPolicy: policy,
      parameters: {}, fallbackQueueName: kind === "video" ? "generation-video" : "generation-image",
    });
    const plan = recordValue(run.plan_json);
    const marketingSkill = marketingGenerationSkill(run.marketing_skill_snapshot_json);
    const videoSkill = marketingGenerationSkill(run.skill_snapshot_json);
    const mediaDirection = sanitizeContentText(text(plan.mediaPrompt) || text(plan.copy) || run.direction);
    if (!mediaDirection) throw codedError("marketing_generation_prompt_required");
    const prompt = `${mediaDirection}${marketingSkill.mediaInstruction
      ? `\n\n已审批营销 Skill 画面约束（不得新增事实）：${marketingSkill.mediaInstruction}`
      : ""}${videoSkill.mediaInstruction
      ? `\n\n已审批视频 Skill 约束（只影响镜头表达，不得新增事实）：${videoSkill.mediaInstruction}`
      : ""}\n\n硬性要求：只生成纯画面。画面中不得出现任何可读文字、数字、字母、品牌名、Logo、商标、水印、二维码、价格标签或界面文字。`;
    const snapshot = await createGenerationModelConfigSnapshotForTask(this.deps.db, model);
    const taskId = randomUUID();
    const requestSnapshot = {
      kind, targetType: "marketing_generation", targetId: run.id, prompt, model: model.modelCode,
      parameters: execution.parameters, providerExecutor: execution.providerExecutor,
      modelConfigSnapshot: snapshot, marketingGenerationRunId: run.id,
      marketingSkill: marketingGenerationSkillAudit(marketingSkill),
      videoSkill: marketingGenerationSkillAudit(videoSkill),
    };
    await this.deps.db.query("BEGIN");
    try {
      const workflow = await createWorkflowWithTasks(this.deps.db, {
        userId: run.owner_user_id, projectId: null,
        workflowType: kind === "image" ? "marketing.image.generate" : "marketing.video.generate",
        inputSnapshot: requestSnapshot,
        tasks: [{ id: taskId, taskType: kind === "image" ? "episode_generate_image" : "episode_generate_video",
          queueName: execution.queueName, targetEntityType: "marketing_generation", targetEntityId: run.id,
          inputSnapshot: requestSnapshot }],
      });
      const task = workflow.tasks[0]!;
      await this.deps.db.query("UPDATE tasks SET idempotency_key = $2 WHERE id = $1", [task.id, `marketing-generation:${run.id}`]);
      await upsertQueuedGenerationTaskSnapshot(this.deps.db, {
        projectId: null, canvasProjectId: null, episodeId: null, targetType: "marketing_generation", targetId: run.id,
        workflowId: workflow.workflow.id, taskId: task.id, modelConfigId: model.id,
        providerConfigRevisionId: text(snapshot.providerConfigRevisionId) || null,
        credentialVersionRef: text(snapshot.credentialVersionRef) || null,
        creditReservationId: null, modelCode: model.modelCode, mediaType: kind, taskMode: execution.taskMode,
        estimatedCredits: 0, requestSummary: { prompt, parameters: execution.parameters, marketingGenerationRunId: run.id },
        creditSummary: { billing: "marketing_super_admin", reserved: 0 }, now: this.now(),
      });
      await appendGenerationTaskCreatedOutboxEvent(this.deps.db, {
        userId: run.owner_user_id, workflowId: workflow.workflow.id, taskId: task.id, kind, modelCode: model.modelCode,
        queueName: execution.queueName, targetType: "marketing_generation", targetId: run.id,
        providerExecutor: execution.providerExecutor,
        providerRouteIdentity: createGenerationProviderRouteIdentity({ modelConfigSnapshot: snapshot }) ?? null,
        providerConfigRevisionId: text(snapshot.providerConfigRevisionId) || null,
        credentialVersionRef: text(snapshot.credentialVersionRef) || null, availableAt: this.now(),
      });
      await this.deps.db.query(
        `UPDATE marketing_generation_runs SET generation_task_id = $2, status = 'generating', updated_at = now()
         WHERE id = $1 AND status = 'planning'`, [run.id, task.id],
      );
      await this.deps.db.query("COMMIT");
      return { runId: run.id, status: "generating" };
    } catch (error) {
      await this.deps.db.query("ROLLBACK");
      throw error;
    }
  }

  private async createPlan(
    run: GenerationRun,
    knowledge: string,
    knowledgeSegmentIds: string[],
    knowledgeSegments: Array<{ id: string; content: string }> = [],
  ) {
    if (this.deps.plan) {
      const result = await this.deps.plan({ run, knowledge, knowledgeSegmentIds });
      const cited = [...new Set(result.knowledgeSegmentIds.filter((id) => knowledgeSegmentIds.includes(id)))];
      if (!cited.length) throw codedError("marketing_text_knowledge_citation_required");
      return normalizeModelPlan(result.output, cited);
    }
    const planner = await createAutomaticMarketingTextPlanner({ db: this.deps.db, env: process.env });
    if (!planner) throw codedError("marketing_text_generation_unavailable");
    const marketingSkill = marketingGenerationSkill(run.marketing_skill_snapshot_json);
    const videoSkill = marketingGenerationSkill(run.skill_snapshot_json);
    const result = await planner.execute({
      runId: run.id,
      campaignId: run.campaign_id,
      createdByAdminId: run.created_by_admin_id,
      stage: "strategy",
      dataClassification: "internal",
      input: {
        direction: run.direction,
        platform: run.platform,
        contentType: run.content_type,
        knowledge: knowledgeSegmentIds.map((id) => ({
          id,
          summary: (knowledgeSegments.find((segment) => segment.id === id)?.content ?? knowledge).slice(0, 1_000),
        })),
      },
      systemRules: [
        "Generate factual Chinese content only from the supplied knowledge and direct content facts.",
        "Do not include personal data, secrets, signed URLs, unauthorized media, copyrighted scripts or shot sequences.",
        ...(marketingSkill.planningInstruction ? [
          "The following approved marketing Skill may change headline, copy structure, hook, narration, and closing style only. It must not add facts, override safety rules, or weaken output constraints.",
          marketingSkill.planningInstruction,
        ] : []),
        ...(videoSkill.planningInstruction ? [
          "The following approved video Skill may change pacing, storyboard, shot language, and media prompt style only. It must not add facts, override safety rules, or weaken output constraints.",
          videoSkill.planningInstruction,
        ] : []),
        "Return output.title (12-30 Chinese characters), output.copy (70-180 Chinese characters), output.script (three numbered shots with on-screen action and narration), and output.mediaPrompt (subject, action, environment, camera treatment, and all three shots).",
        "Write finished Douyin copy directly to the viewer, not an internal plan. Use one concrete audience problem, one supported fact, and one practical outcome; keep the hook, copy, narration, shots, and media prompt on that same proposition.",
        "Never use internal or meta narration such as 本项目, 该项目, 当前项目, 项目给出, 本内容, 本文, 画面动作, 直观呈现, 信息呈现, 依次呈现, 三段结构, or 原创视觉表达. Never use vague placeholders such as 站内工具, 常见问题, 核心看点, 项目素材, or 一个工具.",
        "Every claim and comparison must be supported by supplied facts. Do not invent interfaces, devices, controls, prices, performance, workflows, or product capabilities.",
        "Each shot must show a real user, real creation action, or visible result that serves the proposition. Do not replace missing evidence with abstract chips, abstract generation devices, light streams, symbolic price props, or unrelated decorative scenes.",
        "When the proposition contains a supported price, keep the price in spoken copy or narration. The pure visual prompt should show the real creation use case and result instead of trying to visualize the number with labels or symbols.",
        "For output.mediaPrompt, request a pure visual only: no readable text, numbers, letters, brand names, logos, trademarks, watermarks, QR codes, price labels, or interface text.",
      ],
    });
    const cited = [...new Set(result.knowledgeSegmentIds.filter((id) => knowledgeSegmentIds.includes(id)))];
    if (!cited.length) throw codedError("marketing_text_knowledge_citation_required");
    return normalizeModelPlan(result.output, cited);
  }

  private async loadKnowledgeSegments(ids: string[]) {
    if (!ids.length) return [];
    const result = await this.deps.db.query<{ id: string; content: string }>(
      `SELECT segment.id, segment.content
       FROM marketing_knowledge_segments AS segment
       JOIN marketing_knowledge_documents AS document ON document.id = segment.document_id
       LEFT JOIN marketing_sources AS source ON source.id = document.source_id
       WHERE segment.id = ANY($1::uuid[])
         AND document.status = 'approved'
         AND (source.id IS NULL OR source.status = 'active')`,
      [ids],
    );
    return result.rows;
  }

  private async loadReusableKnowledge(run: GenerationRun, query: string, excludedDocumentIds: string[]) {
    const relevanceTerms = reusableKnowledgeTerms(run.direction);
    const result = await this.deps.db.query<{ id: string; content: string }>(
      `SELECT segment.id, segment.content
       FROM marketing_knowledge_segments AS segment
       JOIN marketing_knowledge_documents AS document ON document.id = segment.document_id
       LEFT JOIN marketing_sources AS source ON source.id = document.source_id
       WHERE document.status = 'approved'
         AND (source.id IS NULL OR source.status = 'active')
         AND (document.project_id = $1 OR document.project_id IS NULL)
         AND (document.applicable_platforms_json = '[]'::jsonb
              OR document.applicable_platforms_json @> jsonb_build_array($2::text))
         AND NOT (document.id = ANY($3::uuid[]))
         AND document.document_type NOT IN ('project_snapshot', 'marketing_optimized')
         AND (
           document.document_type <> 'confirmed_generation'
           OR EXISTS (
             SELECT 1 FROM unnest($4::text[]) AS term(value)
             WHERE length(term.value) >= 2
               AND segment.content ILIKE '%' || term.value || '%'
           )
         )
       ORDER BY CASE WHEN document.document_type = 'confirmed_generation' THEN 0 ELSE 1 END,
                CASE WHEN EXISTS (
                  SELECT 1 FROM unnest($4::text[]) AS term(value)
                  WHERE length(term.value) >= 2
                    AND segment.content ILIKE '%' || term.value || '%'
                ) THEN 0 ELSE 1 END,
                document.confidence_score DESC,
                segment.created_at DESC
       LIMIT 8`,
      [run.project_id, run.platform, excludedDocumentIds, relevanceTerms],
    );
    return result.rows;
  }

  private async collectMedia(run: GenerationRun): Promise<MarketingGenerationWorkerResult> {
    if (!run.generation_task_id) throw codedError("marketing_generation_task_missing");
    const snapshot = await this.deps.db.query<{ status: string; result_assets_json: Json | string | null; failure_json: Json | string | null }>(
      "SELECT status, result_assets_json, failure_json FROM ai_generation_task_snapshots WHERE task_id = $1", [run.generation_task_id],
    );
    const task = snapshot.rows[0];
    if (!task || ["queued", "running"].includes(task.status)) return { runId: run.id, status: "generating" };
    if (task.status !== "succeeded") throw codedError(readFailureCode(task.failure_json) || "marketing_generation_task_failed");
    const storageObjectId = firstStorageObjectId(task.result_assets_json);
    if (!storageObjectId) throw codedError("marketing_generation_output_missing");
    const object = await this.deps.db.query<{ id: string }>(
      `SELECT id FROM storage_objects WHERE id = $1 AND status = 'available' AND deleted_at IS NULL
       AND content_type LIKE $2`, [storageObjectId, run.content_type === "video" ? "video/%" : "image/%"],
    );
    if (!object.rows[0]) throw codedError("marketing_generation_output_unavailable");
    await this.deps.db.query(
      `UPDATE marketing_generation_runs
       SET media_asset_manifest_json = $2::jsonb, status = 'media_ready', updated_at = now()
       WHERE id = $1 AND status = 'generating'`,
      [run.id, JSON.stringify([{ type: run.content_type, storageObjectId, authorizationStatus: "owned" }])],
    );
    return { runId: run.id, status: "media_ready" };
  }

  private async syncPublishStatus(run: GenerationRun): Promise<MarketingGenerationWorkerResult> {
    if (!run.publish_job_id) return { runId: run.id, status: run.status };
    const job = await this.deps.db.query<{ status: string }>("SELECT status FROM marketing_publish_jobs WHERE id = $1", [run.publish_job_id]);
    const publishStatus = job.rows[0]?.status;
    if (!publishStatus) throw codedError("marketing_publish_job_missing");
    const status = publishStatus === "succeeded" ? "succeeded"
      : ["failed", "canceled", "stale", "result_unknown", "needs_attention"].includes(publishStatus) ? "failed"
        : "publishing";
    if (status !== run.status) await this.deps.db.query(
      "UPDATE marketing_generation_runs SET status = $2, failure_code = CASE WHEN $2 = 'failed' THEN $3 ELSE NULL END, updated_at = now() WHERE id = $1",
      [run.id, status, status === "failed" ? `marketing_publish_${publishStatus}` : null],
    );
    return { runId: run.id, status };
  }

  private async fail(runId: string, failureCode: string) {
    await this.deps.db.query(
      `UPDATE marketing_generation_runs SET status = 'failed', failure_code = $2, updated_at = now()
       WHERE id = $1 AND status NOT IN ('succeeded', 'canceled')`, [runId, failureCode],
    );
  }
}

function snapshotText(value: Json | string) {
  const projected = sanitizeSnapshot(typeof value === "string" ? safeJson(value) ?? {} : value);
  return JSON.stringify(projected).slice(0, 12_000).trim();
}

function selectedMarketingModelCode(value: Json | string) {
  const snapshot = typeof value === "string" ? safeJson(value) : value;
  if (!snapshot || Array.isArray(snapshot)) return "";
  return text((snapshot as Record<string, unknown>).marketingModelCode);
}

function marketingGenerationSkill(value: Json | string) {
  const snapshot = recordValue(value);
  return {
    skillId: text(snapshot.skillId),
    code: text(snapshot.code),
    name: text(snapshot.name),
    version: text(snapshot.version),
    contentSha256: text(snapshot.contentSha256),
    planningInstruction: text(snapshot.planningInstruction),
    mediaInstruction: text(snapshot.mediaInstruction),
  };
}

function marketingGenerationSkillAudit(skill: ReturnType<typeof marketingGenerationSkill>) {
  if (!skill.skillId) return null;
  return {
    skillId: skill.skillId,
    code: skill.code,
    name: skill.name,
    version: skill.version,
    contentSha256: skill.contentSha256,
  };
}

function buildKnowledgeSummary(direction: string, source: string) {
  return `管理员确认的创作要求：${sanitizeContentText(direction)}\n\n已确认事实与项目上下文：${source.slice(0, 8_000)}`;
}

function reusableKnowledgeTerms(direction: string) {
  return [...new Set((direction.toLowerCase().match(/[a-z0-9]+(?:[._-][a-z0-9]+)*|[\p{Script=Han}]{2,8}/gu) ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length >= 2))]
    .slice(0, 12);
}

function uniqueKnowledgeSegments(segments: Array<{ id: string; content: string }>) {
  const unique = new Map<string, { id: string; content: string }>();
  for (const segment of segments) {
    if (segment.id && segment.content && !unique.has(segment.id)) unique.set(segment.id, segment);
  }
  return [...unique.values()];
}

function normalizeModelPlan(output: Json, knowledgeSegmentIds: string[]) {
  const value = recordValue(output);
  const plan = {
    title: sanitizeContentText(text(value.title)),
    copy: sanitizeContentText(text(value.copy) || text(value.caption)),
    tags: stringArray(value.tags as Json).map(sanitizeContentText).filter(Boolean).slice(0, 8),
    hook: sanitizeContentText(text(value.hook)),
    script: sanitizeContentText(text(value.script)),
    mediaPrompt: sanitizeContentText(text(value.mediaPrompt) || text(value.prompt)),
    knowledgeSegmentIds,
    source: "text_model_knowledge_plan",
  };
  validateModelPlan(plan);
  return plan;
}

function recordValue(value: Json | string): Record<string, unknown> {
  if (typeof value === "string") { try { return recordValue(JSON.parse(value) as Json); } catch { return {}; } }
  return value && !Array.isArray(value) ? value : {};
}

function stringArray(value: Json | string): string[] {
  if (typeof value === "string") { try { return stringArray(JSON.parse(value) as Json); } catch { return []; } }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function firstStorageObjectId(value: Json | string | null) {
  const items = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(items)) return "";
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const id = (item as Record<string, unknown>).storageObjectId;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return "";
}

function readFailureCode(value: Json | string | null) {
  const record = recordValue(value ?? {});
  return text(record.failureCode);
}

function safeJson(value: string): Json | null { try { return JSON.parse(value) as Json; } catch { return null; } }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function sanitizeContentText(value: string) {
  return value
    .replace(/(?:品牌|广告|营销|推广|引流|种草|转化|带货|促销|投放|商业化)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function validateModelPlan(plan: { title: string; copy: string; script: string; mediaPrompt: string }) {
  if (plan.title.length < 8) throw codedError("marketing_text_plan_title_incomplete");
  if (plan.copy.length < 70) throw codedError("marketing_text_plan_copy_incomplete");
  if (plan.script.length < 90) throw codedError("marketing_text_plan_script_incomplete");
  if (plan.mediaPrompt.length < 100) throw codedError("marketing_text_plan_media_prompt_incomplete");
  for (const shot of [1, 2, 3]) {
    if (!new RegExp(`(?:镜头\\s*${shot}|${shot}[、.])`, "u").test(plan.script)) {
      throw codedError("marketing_text_plan_script_structure_required");
    }
  }
  if (/(?:站内工具|常见问题|核心看点|项目素材|一个工具|本项目|该项目|当前项目|项目给出|本内容|本文|画面动作|直观呈现|信息呈现|依次呈现|三段结构|原创视觉表达|抽象(?:影像)?(?:生成)?(?:装置|设备))/u.test(`${plan.title}\n${plan.copy}\n${plan.script}\n${plan.mediaPrompt}`)) {
    throw codedError("marketing_text_plan_generic_placeholder");
  }
}
function codedError(code: string) { const error = new Error(code); error.name = code; return error; }
function errorCode(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const specific = text(value.failureCode) || text(value.code);
    if (specific) return specific.slice(0, 160);
  }
  return error instanceof Error && error.name ? error.name.slice(0, 160) : "marketing_generation_failed";
}

function sanitizeSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSnapshot);
  if (!value || typeof value !== "object") return typeof value === "string" ? sanitizeText(value) : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(?:api[-_]?key|authorization|cookie|password|secret|token|credential|signature|email|phone|mobile|identity|idcard|address|birthday|身份证|手机号|邮箱|住址|密码|密钥)/i.test(key))
    .map(([key, item]) => [key, sanitizeSnapshot(item)]));
}

function sanitizeText(value: string) {
  return value
    .replace(/https?:\/\/[^\s"']+/gi, "[redacted-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g, "[redacted-token]");
}
