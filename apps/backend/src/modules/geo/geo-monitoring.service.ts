import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import type { GeoServiceResult } from "./geo-content.service.ts";
import { analyzeGeoMonitorAnswer, type GeoMonitorResultStatus } from "./geo-monitoring-analyzer.ts";
import { findGeoPlatform } from "./geo-platforms.ts";
import { loadGeoRuntimeSettings } from "./geo-settings.ts";

const analysisVersion = "geo-citation-v1";
const maxOfficialQuestions = 20;
const monitoringHistoryLimit = 100;
const maxAnswerChars = 20_000;
const maxCitationUrls = 20;
const maxCitationUrlChars = 2_048;
const maxSnapshotChars = 100_000;
const maxOfficialResponseChars = 64_000;
const staleRunAfterMs = 30 * 60 * 1_000;
const defaultProviderCallTimeoutMs = 2 * 60 * 1_000;

interface GeoMonitoringGatewayInput {
  model: string;
  prompt: string;
  createdByUserId: null;
  responseFormat: "json_object";
  maxTokens: number;
  payloadSummary: string;
  requestKeyPrefix: string;
  maxResponseChars?: number;
  signal?: AbortSignal;
}

export interface GeoMonitoringGatewayLike {
  completeJson(input: GeoMonitoringGatewayInput): Promise<string>;
  completeJsonWithUsage?(input: GeoMonitoringGatewayInput): Promise<{
    content: string;
    usage: Record<string, unknown> | null;
    providerRequestId: string;
  }>;
}

type PublishedTarget = {
  content: {
    id: string;
    contentType: string;
    topic: string;
    slug: string;
    href: string;
    publishedVersionId: string;
    publishedVersionNumber: number;
  };
  questions: Array<{ id: string; rawQuestion: string }>;
};

type PreparedResult = {
  id: string;
  questionId: string;
  rawQuestion: string;
  rawAnswer: string;
  citedUrls: string[];
  brandMentioned: boolean;
  articleCited: boolean;
  status: GeoMonitorResultStatus;
  providerRequestId: string | null;
};

type MonitorRunRow = {
  id: string;
  content_version_id: string;
  content_version_number: number;
  platform_id: string;
  source_type: "official_api" | "manual_import";
  status: "running" | "succeeded" | "failed";
  model_code: string | null;
  error_code: string | null;
  error_summary: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
};

type MonitorResultRow = {
  id: string;
  run_id: string;
  question_id: string;
  raw_question: string;
  raw_answer: string;
  cited_urls_json: string[];
  brand_mentioned: boolean;
  article_cited: boolean;
  result_status: GeoMonitorResultStatus;
  analysis_version: string;
  provider_request_id: string | null;
  created_at: Date | string;
};

export function createGeoMonitoringService(deps: {
  db: SqlDatabase;
  gateway?: GeoMonitoringGatewayLike;
  resolveModelProvider?: (modelCode: string) => Promise<string>;
  publicSiteOrigin?: string;
  now?: () => Date;
  providerCallTimeoutMs?: number;
}) {
  const now = deps.now ?? (() => new Date());
  const providerCallTimeoutMs = deps.providerCallTimeoutMs ?? defaultProviderCallTimeoutMs;

  async function listForContent(contentItemId: string): Promise<GeoServiceResult<{
    content: PublishedTarget["content"];
    questions: PublishedTarget["questions"];
    runs: Array<ReturnType<typeof mapRun> & { results: ReturnType<typeof mapResult>[] }>;
  }>> {
    if (!isUuid(contentItemId)) return failure(400, "geo_monitor_content_invalid", "监测内容编号无效。");
    const target = await loadPublishedTarget(deps.db, contentItemId);
    if (!target) return failure(404, "geo_monitor_content_not_published", "仅支持监测当前已发布的GEO内容。");
    const recoveredAt = now();
    await recoverStaleRuns(deps.db, recoveredAt, staleRunAfterMs);
    const runs = await deps.db.query<MonitorRunRow>(
      `SELECT run.*,version.version_number AS content_version_number
         FROM geo_monitor_runs run
         JOIN geo_content_versions version ON version.id=run.content_version_id
        WHERE run.content_item_id=$1
        ORDER BY run.created_at DESC,run.id DESC
        LIMIT $2`,
      [contentItemId, monitoringHistoryLimit],
    );
    const runIds = runs.rows.map((run) => run.id);
    const results = runIds.length > 0
      ? await deps.db.query<MonitorResultRow>(
        `SELECT result.* FROM geo_monitor_results result
          WHERE result.run_id=ANY($1::uuid[])
          ORDER BY result.created_at ASC,result.question_id ASC`,
        [runIds],
      )
      : { rows: [] as MonitorResultRow[] };
    const byRun = new Map<string, ReturnType<typeof mapResult>[]>();
    for (const row of results.rows) {
      const bucket = byRun.get(row.run_id) ?? [];
      bucket.push(mapResult(row));
      byRun.set(row.run_id, bucket);
    }
    return success({
      ...target,
      runs: runs.rows.map((run) => ({ ...mapRun(run), results: byRun.get(run.id) ?? [] })),
    });
  }

  async function importManual(input: {
    contentItemId: string;
    platformId: string;
    results: Array<{ questionId: string; answer: string; citedUrls: string[] }>;
    actorAdminAccountId: string;
  }): Promise<GeoServiceResult<{ runId: string }>> {
    if (!isUuid(input.contentItemId)) return failure(400, "geo_monitor_content_invalid", "监测内容编号无效。");
    const platform = findGeoPlatform(input.platformId);
    if (!platform) return failure(400, "geo_monitor_platform_invalid", "监测平台无效。");
    const target = await loadPublishedTarget(deps.db, input.contentItemId);
    if (!target) return failure(404, "geo_monitor_content_not_published", "仅支持监测当前已发布的GEO内容。");
    const inputByQuestion = new Map(input.results.map((item) => [item.questionId, item]));
    if (input.results.length !== target.questions.length
      || inputByQuestion.size !== target.questions.length
      || target.questions.some((question) => !validManualResult(inputByQuestion.get(question.id)))
      || snapshotChars(input.results) > maxSnapshotChars) {
      return failure(400, "geo_monitor_manual_results_invalid", "请为当前发布版本的每个问题填写一次非空回答。");
    }
    const settings = await loadGeoRuntimeSettings(deps.db);
    const prepared = target.questions.map((question) => prepareResult({
      question,
      answer: inputByQuestion.get(question.id)!.answer,
      citedUrls: inputByQuestion.get(question.id)!.citedUrls,
      brandName: settings.settings.brandName,
      publishedHref: absolutePublishedHref(deps.publicSiteOrigin, target.content.href),
      providerRequestId: null,
    }));
    const runId = randomUUID();
    await persistCompletedRun(deps.db, {
      runId,
      contentItemId: input.contentItemId,
      contentVersionId: target.content.publishedVersionId,
      platformId: platform.id,
      sourceType: "manual_import",
      modelCode: null,
      actorAdminAccountId: input.actorAdminAccountId,
      completedAt: now(),
      results: prepared,
      insertRun: true,
    });
    return created({ runId });
  }

  async function runOfficialApi(input: {
    contentItemId: string;
    platformId: string;
    modelCode: string;
    actorAdminAccountId: string;
    signal?: AbortSignal;
  }): Promise<GeoServiceResult<{ runId: string }>> {
    if (!isUuid(input.contentItemId)) return failure(400, "geo_monitor_content_invalid", "监测内容编号无效。");
    const platform = findGeoPlatform(input.platformId);
    if (!platform) return failure(400, "geo_monitor_platform_invalid", "监测平台无效。");
    if (platform.monitoring.mode !== "official_api") {
      return failure(400, "geo_monitor_platform_manual_only", "该平台仅支持人工导入回答快照。");
    }
    const modelCode = input.modelCode.trim();
    if (!modelCode || !deps.gateway || !deps.resolveModelProvider) {
      return failure(400, "geo_monitor_official_api_unavailable", "官方API监测模型尚未配置。");
    }
    let providerName: string;
    try {
      providerName = (await deps.resolveModelProvider(modelCode)).trim().toLocaleLowerCase("en-US");
    } catch {
      return failure(400, "geo_monitor_model_invalid", "监测模型不可用或配置不完整。");
    }
    if (!platform.monitoring.providerNames.some((candidate) => candidate.toLocaleLowerCase("en-US") === providerName)) {
      return failure(400, "geo_monitor_model_platform_mismatch", "所选模型供应商与监测平台不匹配。");
    }
    const target = await loadPublishedTarget(deps.db, input.contentItemId);
    if (!target) return failure(404, "geo_monitor_content_not_published", "仅支持监测当前已发布的GEO内容。");
    if (target.questions.length > maxOfficialQuestions) {
      return failure(400, "geo_monitor_question_limit_exceeded", `官方API单次最多监测${maxOfficialQuestions}个问题。`);
    }
    const runId = randomUUID();
    const startedAt = now();
    await recoverStaleRuns(deps.db, startedAt, staleRunAfterMs);
    try {
      await deps.db.query(
        `INSERT INTO geo_monitor_runs (
           id,content_item_id,content_version_id,platform_id,source_type,status,model_code,created_by_admin_id,started_at,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,'official_api','running',$5,$6,$7,$7,$7)`,
        [runId, input.contentItemId, target.content.publishedVersionId, platform.id, modelCode, input.actorAdminAccountId, startedAt],
      );
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        return failure(409, "geo_monitor_run_already_running", "该文章和平台已有正在执行的监测任务。");
      }
      throw error;
    }
    try {
      const settings = await loadGeoRuntimeSettings(deps.db);
      const prepared: PreparedResult[] = [];
      let preparedChars = 0;
      for (const question of target.questions) {
        await heartbeatRun(deps.db, runId, now());
        const completed = await completeWithDeadline(deps.gateway, {
          model: modelCode,
          prompt: buildMonitoringPrompt(question.rawQuestion),
          createdByUserId: null,
          responseFormat: "json_object",
          maxTokens: 2500,
          maxResponseChars: maxOfficialResponseChars,
          payloadSummary: `GEO monitor ${runId} ${platform.id}: ${question.rawQuestion.slice(0, 80)}`,
          requestKeyPrefix: `geo-monitor-${platform.id}-${runId}`,
        }, providerCallTimeoutMs, input.signal);
        await heartbeatRun(deps.db, runId, now());
        const parsed = parseMonitoringAnswer(completed.content);
        preparedChars += parsed.answer.length + parsed.citedUrls.reduce((total, url) => total + url.length, 0);
        if (preparedChars > maxSnapshotChars) {
          throw new GeoMonitoringOutputError("geo_monitor_output_invalid", "监测回答总量超过允许范围。");
        }
        prepared.push(prepareResult({
          question,
          answer: parsed.answer,
          citedUrls: parsed.citedUrls,
          brandName: settings.settings.brandName,
          publishedHref: absolutePublishedHref(deps.publicSiteOrigin, target.content.href),
          providerRequestId: completed.providerRequestId,
        }));
      }
      await persistCompletedRun(deps.db, {
        runId,
        contentItemId: input.contentItemId,
        contentVersionId: target.content.publishedVersionId,
        platformId: platform.id,
        sourceType: "official_api",
        modelCode,
        actorAdminAccountId: input.actorAdminAccountId,
        completedAt: now(),
        results: prepared,
        insertRun: false,
      });
      return created({ runId });
    } catch (error) {
      const code = error instanceof GeoMonitoringOutputError ? error.code : "geo_monitor_provider_failed";
      const message = error instanceof GeoMonitoringOutputError ? error.message : "监测平台调用失败，请稍后重试。";
      const failedAt = now();
      await deps.db.query(
        `UPDATE geo_monitor_runs SET status='failed',error_code=$2,error_summary=$3,completed_at=$4,updated_at=$4 WHERE id=$1 AND status='running'`,
        [runId, code, message, failedAt],
      );
      return failure(409, code, message);
    }
  }

  return { listForContent, importManual, runOfficialApi };
}

class GeoMonitoringOutputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function loadPublishedTarget(db: SqlDatabase, contentItemId: string): Promise<PublishedTarget | null> {
  const result = await db.query<{
    id: string;
    content_type: string;
    topic: string;
    slug: string;
    content_version_id: string;
    version_number: number;
    question_id: string;
    raw_question: string;
  }>(
    `SELECT item.id,item.content_type,item.topic,item.slug,version.id AS content_version_id,
            version.version_number,question.id AS question_id,question.raw_question
       FROM geo_content_items item
       JOIN geo_content_versions version ON version.id=item.current_published_version_id
       JOIN geo_content_question_links link ON link.content_version_id=version.id
       JOIN geo_questions question ON question.id=link.question_id
      WHERE item.id=$1 AND item.status='published'
      ORDER BY question.id`,
    [contentItemId],
  );
  const first = result.rows[0];
  if (!first) return null;
  return {
    content: {
      id: first.id,
      contentType: first.content_type,
      topic: first.topic,
      slug: first.slug,
      href: `/${contentTypeRouteName(first.content_type)}/${first.slug}`,
      publishedVersionId: first.content_version_id,
      publishedVersionNumber: first.version_number,
    },
    questions: result.rows.map((row) => ({ id: row.question_id, rawQuestion: row.raw_question })),
  };
}

function prepareResult(input: {
  question: { id: string; rawQuestion: string };
  answer: string;
  citedUrls: string[];
  brandName: string;
  publishedHref: string;
  providerRequestId: string | null;
}): PreparedResult {
  const analysis = analyzeGeoMonitorAnswer({
    answer: input.answer.trim(),
    citedUrls: input.citedUrls,
    brandName: input.brandName,
    publishedHref: input.publishedHref,
  });
  return {
    id: randomUUID(),
    questionId: input.question.id,
    rawQuestion: input.question.rawQuestion,
    rawAnswer: input.answer.trim(),
    citedUrls: analysis.citedUrls,
    brandMentioned: analysis.brandMentioned,
    articleCited: analysis.articleCited,
    status: analysis.status,
    providerRequestId: input.providerRequestId,
  };
}

async function persistCompletedRun(db: SqlDatabase, input: {
  runId: string;
  contentItemId: string;
  contentVersionId: string;
  platformId: string;
  sourceType: "official_api" | "manual_import";
  modelCode: string | null;
  actorAdminAccountId: string;
  completedAt: Date;
  results: PreparedResult[];
  insertRun: boolean;
}) {
  await db.query("BEGIN");
  try {
    if (input.insertRun) {
      await db.query(
        `INSERT INTO geo_monitor_runs (
           id,content_item_id,content_version_id,platform_id,source_type,status,model_code,created_by_admin_id,started_at,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,$5,'running',$6,$7,$8,$8,$8)`,
        [input.runId, input.contentItemId, input.contentVersionId, input.platformId, input.sourceType,
          input.modelCode, input.actorAdminAccountId, input.completedAt],
      );
    }
    const saved = await db.query<{ question_id: string }>(
      `INSERT INTO geo_monitor_results (
         id,run_id,question_id,raw_question,raw_answer,cited_urls_json,brand_mentioned,article_cited,
         result_status,analysis_version,provider_request_id,created_at
       )
       SELECT item.id::uuid,$1,item.question_id::uuid,item.raw_question,item.raw_answer,item.cited_urls::jsonb,
              item.brand_mentioned,item.article_cited,item.result_status,$3,item.provider_request_id::uuid,$4
         FROM jsonb_to_recordset($2::jsonb) AS item(
           id text,question_id text,raw_question text,raw_answer text,cited_urls text,
           brand_mentioned boolean,article_cited boolean,result_status text,provider_request_id text
         )
        WHERE EXISTS (SELECT 1 FROM geo_monitor_runs WHERE id=$1 AND status='running')
       RETURNING question_id`,
      [input.runId, JSON.stringify(input.results.map((item) => ({
        id: item.id,
        question_id: item.questionId,
        raw_question: item.rawQuestion,
        raw_answer: item.rawAnswer,
        cited_urls: JSON.stringify(item.citedUrls),
        brand_mentioned: item.brandMentioned,
        article_cited: item.articleCited,
        result_status: item.status,
        provider_request_id: item.providerRequestId,
      }))), analysisVersion, input.completedAt],
    );
    if (saved.rows.length !== input.results.length) {
      throw new GeoMonitoringOutputError("geo_monitor_run_not_running", "监测任务状态已变化，未保存迟到结果。");
    }
    const transitioned = await db.query<{ id: string }>(
      `UPDATE geo_monitor_runs SET status='succeeded',completed_at=$2,updated_at=$2
        WHERE id=$1 AND status='running' RETURNING id`,
      [input.runId, input.completedAt],
    );
    if (transitioned.rows.length !== 1) {
      throw new GeoMonitoringOutputError("geo_monitor_run_not_running", "监测任务状态已变化，未保存迟到结果。");
    }
    await db.query(
      `UPDATE geo_questions SET last_monitored_at=$2,updated_at=$2 WHERE id=ANY($1::uuid[])`,
      [saved.rows.map((row) => row.question_id), input.completedAt],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function heartbeatRun(db: SqlDatabase, runId: string, heartbeatAt: Date) {
  const heartbeat = await db.query<{ id: string }>(
    "UPDATE geo_monitor_runs SET updated_at=$2 WHERE id=$1 AND status='running' RETURNING id",
    [runId, heartbeatAt],
  );
  if (heartbeat.rows.length !== 1) {
    throw new GeoMonitoringOutputError("geo_monitor_run_not_running", "监测任务状态已变化，已停止后续调用。");
  }
}

async function complete(gateway: GeoMonitoringGatewayLike, input: GeoMonitoringGatewayInput) {
  if (gateway.completeJsonWithUsage) {
    const completed = await gateway.completeJsonWithUsage(input);
    return { content: completed.content, providerRequestId: completed.providerRequestId };
  }
  return { content: await gateway.completeJson(input), providerRequestId: null };
}

async function completeWithDeadline(
  gateway: GeoMonitoringGatewayLike,
  input: Omit<GeoMonitoringGatewayInput, "signal">,
  timeoutMs: number,
  parentSignal?: AbortSignal,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  let rejectTimeout!: (error: Error) => void;
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectTimeout(new GeoMonitoringOutputError("geo_monitor_provider_timeout", "监测平台调用超时，请稍后重试。"));
  }, timeoutMs);
  timer.unref?.();
  try {
    return await Promise.race([
      complete(gateway, { ...input, signal: controller.signal }),
      timeout,
    ]);
  } catch (error) {
    if (timedOut) {
      throw new GeoMonitoringOutputError("geo_monitor_provider_timeout", "监测平台调用超时，请稍后重试。");
    }
    if (parentSignal?.aborted) {
      throw new GeoMonitoringOutputError("geo_monitor_provider_aborted", "监测请求已取消。");
    }
    if (isProviderResponseTooLarge(error)) {
      throw new GeoMonitoringOutputError("geo_monitor_output_invalid", "监测回答超过允许范围。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function parseMonitoringAnswer(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new GeoMonitoringOutputError("geo_monitor_output_invalid", "监测模型未返回有效JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GeoMonitoringOutputError("geo_monitor_output_invalid", "监测模型返回格式无效。");
  }
  const answer = (parsed as Record<string, unknown>).answer;
  const citedUrls = (parsed as Record<string, unknown>).citedUrls;
  if (typeof answer !== "string" || !answer.trim() || answer.trim().length > maxAnswerChars
    || !Array.isArray(citedUrls) || citedUrls.length > maxCitationUrls
    || citedUrls.some((url) => typeof url !== "string" || url.trim().length > maxCitationUrlChars || !isHttpUrl(url))) {
    throw new GeoMonitoringOutputError("geo_monitor_output_invalid", "监测回答或引用链接格式无效。");
  }
  return { answer: answer.trim(), citedUrls: citedUrls.map((url) => (url as string).trim()) };
}

function validManualResult(result: { answer: string; citedUrls: string[] } | undefined) {
  return Boolean(result && typeof result.answer === "string" && result.answer.trim()
    && result.answer.trim().length <= maxAnswerChars
    && Array.isArray(result.citedUrls) && result.citedUrls.length <= maxCitationUrls
    && result.citedUrls.every((url) => typeof url === "string" && url.trim().length <= maxCitationUrlChars && isHttpUrl(url)));
}

function snapshotChars(results: Array<{ answer: string; citedUrls: string[] }>) {
  return results.reduce((total, result) => total + result.answer.trim().length
    + result.citedUrls.reduce((urlTotal, url) => urlTotal + url.trim().length, 0), 0);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.trim());
}

function absolutePublishedHref(publicSiteOrigin: string | undefined, href: string) {
  const origin = publicSiteOrigin?.trim().replace(/\/+$/u, "");
  return origin ? `${origin}${href}` : href;
}

async function recoverStaleRuns(db: SqlDatabase, recoveredAt: Date, staleAfterMs: number) {
  const cutoff = new Date(recoveredAt.getTime() - staleAfterMs);
  await db.query(
    `UPDATE geo_monitor_runs
        SET status='failed',error_code='geo_monitor_stale_run',error_summary='监测进程中断，任务已自动结束。',
            completed_at=$1,updated_at=$1
      WHERE status='running' AND updated_at<$2`,
    [recoveredAt, cutoff],
  );
}

function databaseErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

function isProviderResponseTooLarge(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error
    && error.code === "provider_response_too_large");
}

function buildMonitoringPrompt(question: string) {
  return `请直接回答下面的问题，并只返回JSON对象：{"answer":"完整回答","citedUrls":["实际引用的来源链接"]}。如果没有引用来源，citedUrls返回空数组。不要添加Markdown代码围栏。\n问题：${question}`;
}

function contentTypeRouteName(contentType: string) {
  if (contentType === "case") return "cases";
  if (contentType === "report") return "reports";
  if (contentType === "answer") return "answers";
  return "guides";
}

function mapRun(row: MonitorRunRow) {
  return {
    id: row.id,
    contentVersionId: row.content_version_id,
    contentVersionNumber: row.content_version_number,
    platformId: row.platform_id,
    sourceType: row.source_type,
    status: row.status,
    modelCode: row.model_code,
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at == null ? null : new Date(row.completed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapResult(row: MonitorResultRow) {
  return {
    id: row.id,
    questionId: row.question_id,
    rawQuestion: row.raw_question,
    rawAnswer: row.raw_answer,
    citedUrls: row.cited_urls_json,
    brandMentioned: row.brand_mentioned,
    articleCited: row.article_cited,
    status: row.result_status,
    analysisVersion: row.analysis_version,
    providerRequestId: row.provider_request_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function success<T>(data: T): GeoServiceResult<T> { return { status: 200, body: { data } }; }
function created<T>(data: T): GeoServiceResult<T> { return { status: 201, body: { data } }; }
function failure(status: 400 | 404 | 409, code: string, message: string): GeoServiceResult<never> {
  return { status, body: { error: { code, message } } };
}
