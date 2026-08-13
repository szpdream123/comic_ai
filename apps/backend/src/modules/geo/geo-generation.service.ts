import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import type { GeoServiceResult, createGeoContentService } from "./geo-content.service.ts";
import { validateGeoDraft } from "./geo-content-validator.ts";
import type { GeoBlock, GeoContentType, GeoDocument, GeoEvidenceSnapshot, GeoQualityIssue } from "./geo-types.ts";
import { loadGeoRuntimeSettings } from "./geo-settings.ts";

export interface GeoTextChatGatewayLike {
  completeJson(input: GeoGatewayInput): Promise<string>;
  completeJsonWithUsage?(input: GeoGatewayInput): Promise<{ content: string; usage: Record<string, unknown> | null; providerRequestId: string }>;
}
interface GeoGatewayInput {
  model: string; prompt: string; createdByUserId: null; responseFormat: "json_object";
  maxTokens: number; payloadSummary: string; requestKeyPrefix: string;
}
type ContentService = ReturnType<typeof createGeoContentService>;

export class GeoGenerationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function createGeoGenerationService(deps: {
  db: SqlDatabase; gateway: GeoTextChatGatewayLike; contentService: ContentService; now?: () => Date;
  leaseDurationMs?: number; heartbeatIntervalMs?: number;
}) {
  const now = deps.now ?? (() => new Date());
  const leaseDurationMs = deps.leaseDurationMs ?? 2 * 60 * 60 * 1000;
  const heartbeatIntervalMs = deps.heartbeatIntervalMs ?? 60 * 1000;

  async function generateDraft(input: {
    questionId: string; evidenceIds: string[]; contentType: GeoContentType; topic: string; slug: string;
    modelCode: string; actorAdminAccountId: string;
  }): Promise<GeoServiceResult<{ runId: string; item: unknown; version: unknown }>> {
    const runId = randomUUID();
    const leaseToken = randomUUID();
    const questionResult = await deps.db.query<{ id: string; raw_question: string; topic: string; intent: string; target_platforms_json: string[]; product_capabilities_json: string[] }>(
      `SELECT id,raw_question,topic,intent,target_platforms_json,product_capabilities_json FROM geo_questions WHERE id=$1`,
      [input.questionId],
    );
    const question = questionResult.rows[0];
    if (!question) return failure("geo_question_not_found", "目标问题不存在。", 404);
    const evidenceIds = [...new Set(input.evidenceIds)];
    const evidenceResult = evidenceIds.length
      ? await deps.db.query<{ id: string; name: string; fact_text: string; source_url: string | null; review_status: GeoEvidenceSnapshot["reviewStatus"]; public_use_allowed: boolean; valid_until: Date | string | null }>(
        `SELECT id,name,fact_text,source_url,review_status,public_use_allowed,valid_until FROM geo_evidence_items WHERE id=ANY($1::uuid[])`,
        [evidenceIds],
      )
      : { rows: [] };
    if (evidenceResult.rows.length !== evidenceIds.length) return failure("geo_evidence_not_found", "所选证据不存在。", 400);
    const evidence: GeoEvidenceSnapshot[] = evidenceResult.rows.map((row) => ({
      id: row.id, name: row.name, factText: row.fact_text, sourceUrl: row.source_url,
      reviewStatus: row.review_status, publicUseAllowed: row.public_use_allowed,
      validUntil: row.valid_until == null ? null : new Date(row.valid_until).toISOString(),
    }));
    if (evidence.some((item) => item.reviewStatus !== "approved" || !item.publicUseAllowed || (item.validUntil && new Date(item.validUntil).getTime() < now().getTime()))) {
      return failure("geo_evidence_not_public", "生成资料只能使用已审核、允许公开且仍在有效期内的证据。", 400);
    }
    const [{ settings, revisionId }, existing] = await Promise.all([
      loadGeoRuntimeSettings(deps.db),
      deps.contentService.listPublished(),
    ]);
    const modelCode = input.modelCode.trim() || settings.defaultModelCode;
    if (!modelCode) return failure("geo_model_required", "请先选择GEO生成模型或配置默认模型。", 400);
    const existingDocuments = "data" in existing.body ? existing.body.data.map((entry) => entry.version.document) : [];
    const publicPacket = {
      brand: "灵曦AI",
      question: { id: question.id, question: question.raw_question, topic: question.topic, intent: question.intent, targetPlatforms: question.target_platforms_json, productCapabilities: question.product_capabilities_json },
      evidence,
      contentType: input.contentType,
      topic: input.topic,
      brandFacts: settings.brandFacts,
      brandTone: settings.brandTone,
      forbiddenPhrases: settings.forbiddenPhrases,
      targetWordRange: settings.defaultWordRange,
      rules: ["只使用资料包中的事实", "数字声明必须绑定evidenceIds", "不得出现旧品牌灵曦剧场", "不得承诺自动向第三方平台发帖"],
    };
    const startedAt = now();
    await deps.db.query(
      `INSERT INTO geo_generation_runs (
         id,run_type,status,model_code,prompt_template_revision,input_snapshot_json,evidence_ids_json,
         provider_request_ids_json,created_by_admin_id,started_at,heartbeat_at,lease_expires_at,lease_token,created_at,updated_at
       ) VALUES ($1,'generate','running',$2,'geo-default-v1',$3::jsonb,$4::jsonb,'[]'::jsonb,$5,$6,$6,$7,$8,$6,$6)`,
      [runId, modelCode, JSON.stringify(publicPacket), JSON.stringify(evidenceIds), input.actorAdminAccountId, startedAt, leaseExpiry(startedAt, leaseDurationMs), leaseToken],
    );

    const providerRequestIds: string[] = [];
    const usage: Record<string, unknown>[] = [];
    const heartbeat = startGenerationHeartbeat({ db: deps.db, runId, leaseToken, now, leaseDurationMs, heartbeatIntervalMs });
    try {
      const writer = await complete(deps.gateway, {
        model: modelCode,
        prompt: buildWriterPrompt(publicPacket),
        createdByUserId: null,
        responseFormat: "json_object",
        maxTokens: 6000,
        payloadSummary: `GEO writer: ${input.topic}`,
        requestKeyPrefix: "geo-writer",
      });
      providerRequestIds.push(writer.providerRequestId);
      if (writer.usage) usage.push(writer.usage);
      await assertGenerationLease(deps.db, runId, leaseToken, now(), leaseDurationMs);
      const document = parseGeoGeneratedDocument(writer.content);
      const deterministic = validateGeoDraft({ document, evidence, existingDocuments, now: now(), similarityThreshold: settings.similarityThreshold });

      const reviewer = await complete(deps.gateway, {
        model: modelCode,
        prompt: buildReviewerPrompt(publicPacket, document, deterministic),
        createdByUserId: null,
        responseFormat: "json_object",
        maxTokens: 2500,
        payloadSummary: `GEO reviewer: ${input.topic}`,
        requestKeyPrefix: "geo-reviewer",
      });
      providerRequestIds.push(reviewer.providerRequestId);
      if (reviewer.usage) usage.push(reviewer.usage);
      await assertGenerationLease(deps.db, runId, leaseToken, now(), leaseDurationMs);
      const reviewIssues = parseReviewIssues(reviewer.content);
      const qualityReport = {
        blockers: [...deterministic.blockers, ...reviewIssues.filter((item) => item.severity === "blocker").map(stripSeverity)],
        warnings: [...deterministic.warnings, ...reviewIssues.filter((item) => item.severity === "warning").map(stripSeverity)],
        checkedAt: now().toISOString(),
      };
      const draft = await deps.contentService.createDraftFromDocument({
        contentType: input.contentType, topic: input.topic, slug: input.slug,
        questionIds: [input.questionId], evidenceIds, document, generationRunId: runId,
        configRevisionId: revisionId, actorAdminAccountId: input.actorAdminAccountId, qualityReport,
        generationCompletion: { leaseToken, providerRequestIds, usage: { stages: usage } },
      });
      if (!("data" in draft.body)) throw new GeoGenerationError(draft.body.error.code, draft.body.error.message);
      return { status: 201, body: { data: { runId, item: draft.body.data.item, version: draft.body.data.version } } };
    } catch (error) {
      const normalized = normalizeGenerationError(error);
      await deps.db.query(
        `UPDATE geo_generation_runs SET status='failed',provider_request_ids_json=$2::jsonb,usage_json=$3::jsonb,
           error_code=$4,error_summary=$5,completed_at=$6,updated_at=$6
         WHERE id=$1 AND lease_token=$7 AND status='running'`,
        [runId, JSON.stringify(providerRequestIds), JSON.stringify({ stages: usage }), normalized.code, normalized.message, now(), leaseToken],
      );
      return failure(normalized.code, normalized.message, 409);
    } finally {
      await heartbeat.stop();
    }
  }

  return { generateDraft };
}

export async function recoverStaleGeoGenerationRuns(input: {
  db: SqlDatabase;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const result = await input.db.query<{ id: string }>(
    `UPDATE geo_generation_runs SET status='failed',error_code='generation_run_abandoned',
       error_summary='生成进程中断，任务已标记为可重新生成。',completed_at=$2,updated_at=$2
     WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<$1) RETURNING id`,
    [now, now],
  );
  return result.rows.length;
}

async function renewGenerationLease(db: SqlDatabase, runId: string, leaseToken: string, now: Date, leaseDurationMs: number) {
  const result = await db.query<{ id: string }>(
    `UPDATE geo_generation_runs SET heartbeat_at=$3,lease_expires_at=$4,updated_at=$3
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>=$3 RETURNING id`,
    [runId, leaseToken, now, leaseExpiry(now, leaseDurationMs)],
  );
  return Boolean(result.rows[0]);
}
async function assertGenerationLease(db: SqlDatabase, runId: string, leaseToken: string, now: Date, leaseDurationMs: number) {
  if (!await renewGenerationLease(db, runId, leaseToken, now, leaseDurationMs)) {
    throw new GeoGenerationError("geo_generation_lease_lost", "生成任务租约已失效，请重新生成。");
  }
}
function startGenerationHeartbeat(input: { db: SqlDatabase; runId: string; leaseToken: string; now: () => Date; leaseDurationMs: number; heartbeatIntervalMs: number }) {
  let renewing = false;
  let inFlight: Promise<unknown> | null = null;
  const timer = setInterval(() => {
    if (renewing) return;
    renewing = true;
    inFlight = renewGenerationLease(input.db, input.runId, input.leaseToken, input.now(), input.leaseDurationMs)
      .catch(() => false)
      .finally(() => { renewing = false; inFlight = null; });
  }, input.heartbeatIntervalMs);
  timer.unref?.();
  return { stop: async () => { clearInterval(timer); await inFlight; } };
}
function leaseExpiry(now: Date, leaseDurationMs: number) { return new Date(now.getTime() + leaseDurationMs); }

export function parseGeoGeneratedDocument(raw: string): GeoDocument {
  let value: unknown;
  try { value = JSON.parse(stripSingleJsonFence(raw)); }
  catch { throw new GeoGenerationError("generated_document_invalid", "模型未返回有效JSON正文。"); }
  if (!isRecord(value) || !nonEmpty(value.title) || !nonEmpty(value.summary) || !nonEmpty(value.directAnswer)) invalid();
  if (!Array.isArray(value.blocks) || !value.blocks.every(isGeoBlock)) invalid();
  if (!Array.isArray(value.faq) || !value.faq.every((item) => isRecord(item) && nonEmpty(item.question) && nonEmpty(item.answer))) invalid();
  if (!isRecord(value.socialDrafts) || !["zhihu", "xiaohongshu", "bilibili", "wechat"].every((key) => typeof value.socialDrafts[key] === "string")) invalid();
  if (!isRecord(value.seo) || !nonEmpty(value.seo.title) || !nonEmpty(value.seo.description)) invalid();
  return value as unknown as GeoDocument;
}

async function complete(gateway: GeoTextChatGatewayLike, input: GeoGatewayInput) {
  if (gateway.completeJsonWithUsage) return gateway.completeJsonWithUsage(input);
  return { content: await gateway.completeJson(input), usage: null, providerRequestId: `local-${randomUUID()}` };
}

function buildWriterPrompt(packet: unknown) {
  return `你是灵曦AI的GEO内容作者。严格依据资料包输出一个JSON对象，不要Markdown代码围栏。\n资料包：${JSON.stringify(packet)}\n字段必须为 title, summary, directAnswer, blocks, faq, socialDrafts, seo。blocks只允许 paragraph/heading/list/steps/quote/table/image/note/cta，事实块用evidenceIds引用资料包证据。`;
}
function buildReviewerPrompt(packet: unknown, document: GeoDocument, report: unknown) {
  return `你是独立内容审查员。根据资料包审查正文，不要重写正文。只输出 {"issues":[{"severity":"blocker|warning","code":"...","message":"...","path":"..."}]}。\n资料包：${JSON.stringify(packet)}\n正文：${JSON.stringify(document)}\n确定性检查：${JSON.stringify(report)}`;
}

function parseReviewIssues(raw: string): Array<GeoQualityIssue & { severity: "blocker" | "warning" }> {
  let value: unknown;
  try { value = JSON.parse(stripSingleJsonFence(raw)); }
  catch { throw new GeoGenerationError("review_output_invalid", "审查模型未返回有效JSON。"); }
  if (!isRecord(value) || !Array.isArray(value.issues)) throw new GeoGenerationError("review_output_invalid", "审查结果缺少issues数组。");
  return value.issues.map((item) => {
    if (!isRecord(item) || (item.severity !== "blocker" && item.severity !== "warning") || !nonEmpty(item.code) || !nonEmpty(item.message)) {
      throw new GeoGenerationError("review_output_invalid", "审查问题格式无效。");
    }
    return typeof item.path === "string"
      ? { severity: item.severity, code: item.code, message: item.message, path: item.path }
      : { severity: item.severity, code: item.code, message: item.message };
  });
}

function isGeoBlock(value: unknown): value is GeoBlock {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  const evidenceIdsValid = !Object.hasOwn(value, "evidenceIds") || stringArray(value.evidenceIds);
  if (!evidenceIdsValid) return false;
  switch (value.type) {
    case "paragraph": return nonEmpty(value.text) && stringArray(value.evidenceIds);
    case "heading": return nonEmpty(value.text) && [2, 3, 4].includes(Number(value.level));
    case "list": return typeof value.ordered === "boolean" && stringArray(value.items) && stringArray(value.evidenceIds);
    case "steps": return Array.isArray(value.items) && value.items.every((item) => isRecord(item) && nonEmpty(item.title) && nonEmpty(item.body)) && stringArray(value.evidenceIds);
    case "quote": return nonEmpty(value.text) && nonEmpty(value.sourceLabel) && nonEmpty(value.sourceUrl) && stringArray(value.evidenceIds);
    case "table": return stringArray(value.headers) && Array.isArray(value.rows) && value.rows.every(stringArray) && stringArray(value.evidenceIds);
    case "image": return nonEmpty(value.src) && nonEmpty(value.alt) && typeof value.caption === "string" && stringArray(value.evidenceIds);
    case "note": return (value.tone === "info" || value.tone === "warning") && nonEmpty(value.text);
    case "cta": return nonEmpty(value.title) && nonEmpty(value.body) && nonEmpty(value.href) && nonEmpty(value.label);
    default: return false;
  }
}

function stripSingleJsonFence(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1]! : trimmed;
}
function stripSeverity(issue: GeoQualityIssue & { severity: string }): GeoQualityIssue {
  return issue.path ? { code: issue.code, message: issue.message, path: issue.path } : { code: issue.code, message: issue.message };
}
function normalizeGenerationError(error: unknown) {
  if (error instanceof GeoGenerationError) return { code: error.code, message: safeErrorMessage(error.message) };
  return { code: "model_generation_failed", message: safeErrorMessage(error instanceof Error ? error.message : "模型生成失败。") };
}
function safeErrorMessage(value: string) {
  return value.replace(/(?:sk|key|token|secret)[-_][a-z0-9_-]{8,}/gi, "[REDACTED]").slice(0, 240) || "模型生成失败。";
}
function invalid(): never { throw new GeoGenerationError("generated_document_invalid", "生成正文结构不符合GEO文档约束。"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function failure(code: string, message: string, status: 400 | 404 | 409): GeoServiceResult<never> { return { status, body: { error: { code, message } } }; }
