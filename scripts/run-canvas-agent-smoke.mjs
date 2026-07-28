import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

loadDotEnvFile(join(process.cwd(), ".env"));

const canvasId = required("CANVAS_AGENT_SMOKE_CANVAS_ID");
const account = required("CANVAS_AGENT_SMOKE_ACCOUNT");
const actorKind = String(process.env.CANVAS_AGENT_SMOKE_ACTOR ?? "owner").trim().toLowerCase();
if (!new Set(["owner", "member"]).has(actorKind)) failConfiguration("canvas_agent_smoke_actor_invalid");
const port = String(process.env.PORT ?? "").trim();
const baseUrl = String(process.env.CANVAS_AGENT_SMOKE_BASE_URL ?? "").trim()
  || (port ? `http://127.0.0.1:${port}` : "");
if (!baseUrl) failConfiguration("canvas_agent_smoke_base_url_not_configured");
const password = String(process.env.CANVAS_AGENT_SMOKE_PASSWORD ?? "").trim()
  || (actorKind === "owner" ? ownerPasswordFromAccount(account) : "");
if (!password) failConfiguration("canvas_agent_smoke_password_not_configured");
const prompt = String(process.env.CANVAS_AGENT_SMOKE_PROMPT ?? "").trim()
  || "请只回复一句 Canvas Agent smoke passed，不调用任何工具。";
const modelCode = String(process.env.CANVAS_AGENT_SMOKE_MODEL_CODE ?? "").trim();
const timeoutMs = positiveInteger(process.env.CANVAS_AGENT_SMOKE_TIMEOUT_MS, 180_000);
const submitOnly = envFlag("CANVAS_AGENT_SMOKE_SUBMIT_ONLY");
const requireWebSearch = envFlag("CANVAS_AGENT_SMOKE_REQUIRE_WEB_SEARCH");
const resumeTaskId = String(process.env.CANVAS_AGENT_SMOKE_RESUME_TASK_ID ?? "").trim();
if (submitOnly && resumeTaskId) failConfiguration("canvas_agent_smoke_submit_resume_conflict");

const [{ createDevDb, runWithDatabaseContext }, {
  createCanvasAgentWorkerRuntime,
  loadCanvasAgentRuntimeConfiguration,
}] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/canvas-agent/index.ts"),
]);

const db = await createDevDb();
try {
  const cookie = await passwordLogin();
  let conversationId = "";
  let taskId = resumeTaskId;
  if (resumeTaskId) {
    const resumed = await db.query(`
      SELECT conversation_id,status
      FROM canvas_agent_tasks
      WHERE id=$1 AND canvas_id=$2
      LIMIT 1
    `, [resumeTaskId, canvasId]);
    conversationId = String(resumed.rows[0]?.conversation_id ?? "");
    if (!conversationId) throw new Error("canvas_agent_smoke_resume_task_not_found");
  } else {
    const conversationPayload = await api(`/api/canvas/${encodeURIComponent(canvasId)}/conversations`, cookie, {
      method: "POST",
      body: { title: `Canvas Agent smoke ${new Date().toISOString()}` },
    });
    conversationId = String(conversationPayload?.conversation?.id ?? "");
    if (!conversationId) throw new Error("canvas_agent_smoke_conversation_missing");
    const taskPayload = await api(
      `/api/canvas/${encodeURIComponent(canvasId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
      cookie,
      {
        method: "POST",
        body: {
          mode: "b",
          message: prompt,
          ...(modelCode ? { modelCode } : {}),
        },
      },
    );
    taskId = String(taskPayload?.task?.id ?? "");
    if (!taskId) throw new Error("canvas_agent_smoke_task_missing");
  }

  if (submitOnly) {
    const submitted = await db.query(`
      SELECT agent.status,workflow.status AS workflow_status,task.status AS task_status,
             count(DISTINCT wakeup.id)::integer AS wakeup_count,
             count(DISTINCT request.id)::integer AS provider_request_count
      FROM canvas_agent_tasks agent
      JOIN workflows workflow ON workflow.id=agent.workflow_id
      JOIN tasks task ON task.id=agent.workflow_task_id
      LEFT JOIN canvas_agent_wakeups wakeup ON wakeup.task_id=agent.id
      LEFT JOIN canvas_agent_steps step ON step.task_id=agent.id
      LEFT JOIN provider_requests request ON request.id=step.provider_request_id
      WHERE agent.id=$1 AND agent.canvas_id=$2
      GROUP BY agent.id,workflow.id,task.id
    `, [taskId, canvasId]);
    const row = submitted.rows[0];
    if (row?.status !== "queued" || row?.workflow_status !== "queued" || row?.task_status !== "queued") {
      throw new Error("canvas_agent_smoke_submit_state_invalid");
    }
    if (Number(row.wakeup_count) < 1) throw new Error("canvas_agent_smoke_submit_wakeup_missing");
    if (Number(row.provider_request_count) !== 0) throw new Error("canvas_agent_smoke_submit_provider_started");
    console.log(JSON.stringify({
      ok: true,
      phase: "submitted",
      actorKind,
      canvasId,
      conversationId,
      taskId,
      taskStatus: row.status,
      workflowStatus: row.workflow_status,
      wakeupPresent: true,
      providerStarted: false,
      resumeWith: "CANVAS_AGENT_SMOKE_RESUME_TASK_ID",
    }, null, 2));
  } else {
    if (resumeTaskId) await assertQueuedResumeState(taskId);
    const runtimeConfiguration = await loadCanvasAgentRuntimeConfiguration(db);
    if (requireWebSearch && !runtimeConfiguration.webSearchModelCode) {
      throw new Error("canvas_agent_smoke_search_provider_not_configured");
    }
    const runtime = createCanvasAgentWorkerRuntime({
      db,
      env: process.env,
      workerId: `canvas-agent-smoke:${hostname()}:${process.pid}:${randomUUID()}`,
      policy: runtimeConfiguration.policy,
      webSearchModelCode: runtimeConfiguration.webSearchModelCode,
      maxRounds: runtimeConfiguration.maxRounds,
      maxToolCalls: runtimeConfiguration.maxToolCalls,
    });
    await runWithDatabaseContext(() => runtime.worker.processTask(taskId));

    const terminal = await waitForTerminalTask(taskId, cookie);
    const messages = await api(
      `/api/canvas/${encodeURIComponent(canvasId)}/conversations/${encodeURIComponent(conversationId)}/messages?limit=200`,
      cookie,
    );
    const assistantMessages = Array.isArray(messages?.messages)
      ? messages.messages.filter((message) => message?.role === "assistant" && message?.taskId === taskId)
      : [];
    const evidence = await db.query(`
    SELECT task.status,task.model_code,task.metrics_json,
           count(DISTINCT step.provider_request_id)::integer AS provider_request_count,
           count(DISTINCT CASE WHEN provider.status='succeeded' THEN provider.id END)::integer AS succeeded_provider_count,
           count(DISTINCT CASE WHEN provider.external_submission_started_at IS NOT NULL THEN provider.id END)::integer AS external_submission_count,
           count(DISTINCT step.credit_reservation_id)::integer AS credit_reservation_count,
           (SELECT count(*)::integer FROM credit_ledger_entries ledger
            WHERE ledger.source_type='canvas_agent_text_round'
              AND ledger.metadata_json->>'agentTaskId'=task.id::text) AS billing_ledger_count
    FROM canvas_agent_tasks task
    LEFT JOIN canvas_agent_steps step ON step.task_id=task.id
    LEFT JOIN provider_requests provider ON provider.id=step.provider_request_id
    WHERE task.id=$1
    GROUP BY task.id
  `, [taskId]);
    const row = evidence.rows[0];
    const metrics = row?.metrics_json && typeof row.metrics_json === "object" ? row.metrics_json : {};
    const totalTokens = Number(metrics.totalTokens ?? metrics.total_tokens ?? 0);
    if (terminal.status !== "succeeded" || row?.status !== "succeeded") {
      throw new Error(`canvas_agent_smoke_task_failed:${terminal.status}:${row?.status ?? "missing"}`);
    }
    if (Number(row.provider_request_count) < 1 || Number(row.succeeded_provider_count) < 1) {
      throw new Error("canvas_agent_smoke_provider_evidence_missing");
    }
    if (Number(row.external_submission_count) < 1) {
      throw new Error("canvas_agent_smoke_external_submission_evidence_missing");
    }
    if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
      throw new Error("canvas_agent_smoke_usage_missing");
    }
    if (Number(row.credit_reservation_count) < 1 && Number(row.billing_ledger_count) < 1) {
      throw new Error("canvas_agent_smoke_billing_evidence_missing");
    }
    if (!assistantMessages.length) throw new Error("canvas_agent_smoke_assistant_message_missing");

    const webEvidence = await db.query(`
      SELECT count(*)::integer AS citation_count,
             count(*) FILTER (WHERE metadata_json->>'providerId' IS NOT NULL)::integer AS search_citation_count
      FROM canvas_agent_citations
      WHERE task_id=$1 AND source_type='web'
    `, [taskId]);
    const webCitationCount = Number(webEvidence.rows[0]?.citation_count ?? 0);
    const searchCitationCount = Number(webEvidence.rows[0]?.search_citation_count ?? 0);
    if (requireWebSearch && searchCitationCount < 1) {
      throw new Error("canvas_agent_smoke_web_search_evidence_missing");
    }

    console.log(JSON.stringify({
      ok: true,
      phase: resumeTaskId ? "resumed" : "complete",
      actorKind,
      canvasId,
      conversationId,
      taskId,
      taskStatus: row.status,
      modelCode: row.model_code,
      providerRequestCount: Number(row.provider_request_count),
      succeededProviderCount: Number(row.succeeded_provider_count),
      externalSubmissionCount: Number(row.external_submission_count),
      totalTokens,
      billingEvidencePresent: true,
      assistantMessagePresent: true,
      ...(requireWebSearch ? {
        webSearchEvidence: {
          citationCount: webCitationCount,
          searchCitationCount,
        },
      } : {}),
    }, null, 2));
  }
} catch (error) {
  console.error("Canvas Agent smoke failed.");
  console.error(`message=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await db.close();
}

async function passwordLogin() {
  const response = await fetch(`${baseUrl}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, ...(actorKind === "member" ? { actorType: "team_member" } : {}) }),
  });
  if (!response.ok) throw new Error(`canvas_agent_smoke_login_failed:${response.status}`);
  const cookie = response.headers.get("set-cookie") ?? "";
  if (!cookie) throw new Error("canvas_agent_smoke_login_cookie_missing");
  return cookie;
}

async function api(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      cookie,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload?.error?.code ?? payload?.errorCode ?? `http_${response.status}`;
    throw new Error(`canvas_agent_smoke_http_failed:${response.status}:${code}`);
  }
  return payload?.data ?? payload;
}

async function waitForTerminalTask(taskId, cookie) {
  const deadline = Date.now() + timeoutMs;
  const terminalTypes = new Map([
    ["task.succeeded", "succeeded"],
    ["task.failed", "failed"],
    ["task.canceled", "canceled"],
  ]);
  while (Date.now() < deadline) {
    const payload = await api(
      `/api/canvas/${encodeURIComponent(canvasId)}/agent-tasks/${encodeURIComponent(taskId)}/events?after=0&limit=500`,
      cookie,
    );
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const terminal = [...events].reverse().find((event) => terminalTypes.has(event?.eventType));
    if (terminal) return { status: terminalTypes.get(terminal.eventType), event: terminal };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("canvas_agent_smoke_timeout");
}

async function assertQueuedResumeState(taskId) {
  const resumed = await db.query(`
    SELECT agent.status,workflow.status AS workflow_status,task.status AS task_status,
           count(DISTINCT wakeup.id)::integer AS wakeup_count,
           count(DISTINCT provider.id)::integer AS provider_request_count
    FROM canvas_agent_tasks agent
    JOIN workflows workflow ON workflow.id=agent.workflow_id
    JOIN tasks task ON task.id=agent.workflow_task_id
    LEFT JOIN canvas_agent_wakeups wakeup ON wakeup.task_id=agent.id
    LEFT JOIN canvas_agent_steps step ON step.task_id=agent.id
    LEFT JOIN provider_requests provider ON provider.id=step.provider_request_id
    WHERE agent.id=$1 AND agent.canvas_id=$2
    GROUP BY agent.id,workflow.id,task.id
  `, [taskId, canvasId]);
  const row = resumed.rows[0];
  if (!row) throw new Error("canvas_agent_smoke_resume_task_not_found");
  if (row.status !== "queued" || row.workflow_status !== "queued" || row.task_status !== "queued") {
    throw new Error("canvas_agent_smoke_resume_state_invalid");
  }
  if (Number(row.wakeup_count) < 1) throw new Error("canvas_agent_smoke_resume_wakeup_missing");
  if (Number(row.provider_request_count) !== 0) {
    throw new Error("canvas_agent_smoke_resume_provider_already_started");
  }
}

function ownerPasswordFromAccount(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-6) : "";
}

function required(key) {
  const value = String(process.env[key] ?? "").trim();
  if (!value) failConfiguration(`${key.toLowerCase()}_not_configured`);
  return value;
}

function failConfiguration(message) {
  console.error("Canvas Agent smoke failed.");
  console.error(`message=${message}`);
  process.exit(1);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlag(key) {
  return String(process.env[key] ?? "false").trim().toLowerCase() === "true";
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) return;
  for (const rawLine of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
