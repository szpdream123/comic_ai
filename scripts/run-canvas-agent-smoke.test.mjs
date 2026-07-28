import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./run-canvas-agent-smoke.mjs", import.meta.url), "utf8");

test("Canvas Agent smoke supports a persisted submit and resumed-worker phase", () => {
  assert.match(source, /CANVAS_AGENT_SMOKE_SUBMIT_ONLY/);
  assert.match(source, /CANVAS_AGENT_SMOKE_RESUME_TASK_ID/);
  assert.match(source, /WHERE id=\$1 AND canvas_id=\$2/);
  assert.match(source, /workflow\.status AS workflow_status,task\.status AS task_status/);
  assert.match(source, /count\(DISTINCT wakeup\.id\)::integer AS wakeup_count/);
  assert.match(source, /provider_request_count\) !== 0/);
  assert.match(source, /assertQueuedResumeState\(taskId\)/);
  assert.match(source, /canvas_agent_smoke_resume_state_invalid/);
  assert.match(source, /canvas_agent_smoke_resume_provider_already_started/);
  assert.match(source, /runtime\.worker\.processTask\(taskId\)/);
  assert.match(source, /phase: resumeTaskId \? "resumed" : "complete"/);
});

test("Canvas Agent smoke keeps formal password auth and external evidence checks", () => {
  assert.match(source, /\/api\/auth\/password\/login/);
  assert.match(source, /actorType: "team_member"/);
  assert.match(source, /canvas_agent_smoke_provider_evidence_missing/);
  assert.match(source, /external_submission_started_at IS NOT NULL/);
  assert.match(source, /canvas_agent_smoke_external_submission_evidence_missing/);
  assert.match(source, /canvas_agent_smoke_billing_evidence_missing/);
  assert.match(source, /canvas_agent_smoke_assistant_message_missing/);
  assert.doesNotMatch(source, /\/api\/auth\/(?:code\/request|code\/verify|dev\/challenges)/);
});

test("Canvas Agent smoke can require a real external web-search citation", () => {
  assert.match(source, /CANVAS_AGENT_SMOKE_REQUIRE_WEB_SEARCH/);
  assert.match(source, /webSearchModelCode/);
  assert.match(source, /canvas_agent_citations/);
  assert.match(source, /source_type='web'/);
  assert.match(source, /metadata_json->>'providerId'/);
  assert.match(source, /canvas_agent_smoke_web_search_evidence_missing/);
});
