import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGeoMonitoringService, type GeoMonitoringGatewayLike } from "../geo-monitoring.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";

const adminId = "35000000-0000-4000-8000-000000000001";
const contentId = "35000000-0000-4000-8000-000000000002";
const versionId = "35000000-0000-4000-8000-000000000003";
const questionIds = [
  "35000000-0000-4000-8000-000000000004",
  "35000000-0000-4000-8000-000000000005",
] as const;
const fixedNow = new Date("2026-08-25T04:00:00.000Z");
const providerRequestIds = [
  "35000000-0000-4000-8000-000000000006",
  "35000000-0000-4000-8000-000000000007",
] as const;

describe("GEO monitoring service", () => {
  it("imports one complete manual snapshot and lists its immutable evidence", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedPublishedContent(db);
      const service = createGeoMonitoringService({ db, publicSiteOrigin: "https://lingxi.ai", now: () => fixedNow });

      const invalid = await service.listForContent("not-a-uuid");
      assert.equal(invalid.status, 400);
      if ("error" in invalid.body) assert.equal(invalid.body.error.code, "geo_monitor_content_invalid");
      const missing = await service.listForContent("35000000-0000-4000-8000-000000000010");
      assert.equal(missing.status, 404);

      const incomplete = await service.importManual({
        contentItemId: contentId,
        platformId: "kimi",
        results: [{ questionId: questionIds[0], answer: "灵曦AI 可以用于制作分镜。", citedUrls: [] }],
        actorAdminAccountId: adminId,
      });
      assert.equal(incomplete.status, 400);
      if ("error" in incomplete.body) assert.equal(incomplete.body.error.code, "geo_monitor_manual_results_invalid");
      const invalidUrl = await service.importManual({
        contentItemId: contentId,
        platformId: "kimi",
        results: [
          { questionId: questionIds[0], answer: "回答一", citedUrls: ["javascript:alert(1)"] },
          { questionId: questionIds[1], answer: "回答二", citedUrls: [] },
        ],
        actorAdminAccountId: adminId,
      });
      assert.equal(invalidUrl.status, 400);
      const oversizedAnswer = await service.importManual({
        contentItemId: contentId,
        platformId: "kimi",
        results: [
          { questionId: questionIds[0], answer: "字".repeat(20_001), citedUrls: [] },
          { questionId: questionIds[1], answer: "回答二", citedUrls: [] },
        ],
        actorAdminAccountId: adminId,
      });
      assert.equal(oversizedAnswer.status, 400);

      const imported = await service.importManual({
        contentItemId: contentId,
        platformId: "kimi",
        results: [
          { questionId: questionIds[0], answer: "推荐灵曦 AI，详情见官网。", citedUrls: ["https://lingxi.ai/guides/ai-storyboard-guide?utm_source=kimi"] },
          { questionId: questionIds[1], answer: "可使用其他工具。", citedUrls: [] },
        ],
        actorAdminAccountId: adminId,
      });
      assert.equal(imported.status, 201);

      const listed = await service.listForContent(contentId);
      assert.equal(listed.status, 200);
      if (!("data" in listed.body)) throw new Error("expected monitoring data");
      assert.equal(listed.body.data.content.href, "/guides/ai-storyboard-guide");
      assert.equal(listed.body.data.questions.length, 2);
      assert.equal(listed.body.data.runs.length, 1);
      assert.equal(listed.body.data.runs[0]?.sourceType, "manual_import");
      assert.equal(listed.body.data.runs[0]?.contentVersionId, versionId);
      assert.equal(listed.body.data.runs[0]?.contentVersionNumber, 1);
      assert.deepEqual(listed.body.data.runs[0]?.results.map((item) => item.status), ["cited", "not_mentioned"]);
      const timestamps = await db.query<{ last_monitored_at: Date | null }>(
        `SELECT last_monitored_at FROM geo_questions WHERE id=ANY($1::uuid[]) ORDER BY id`,
        [[...questionIds]],
      );
      assert.ok(timestamps.rows.every((row) => row.last_monitored_at?.toISOString() === fixedNow.toISOString()));
    } finally {
      await db.close();
    }
  });

  it("runs official API checks only for a provider compatible with the platform", async () => {
    const db = await createMigratedTestDb();
    const calls: Array<Record<string, unknown>> = [];
    const answers = [
      JSON.stringify({ answer: "灵曦AI 的指南见 https://lingxi.ai/guides/ai-storyboard-guide", citedUrls: [] }),
      JSON.stringify({ answer: "没有找到相关信息。", citedUrls: [] }),
    ];
    const gateway: GeoMonitoringGatewayLike = {
      async completeJsonWithUsage(input) {
        calls.push(input as unknown as Record<string, unknown>);
        return {
          content: answers[calls.length - 1]!,
          usage: { outputTokens: 10 },
          providerRequestId: providerRequestIds[calls.length - 1]!,
        };
      },
    };
    try {
      await seedPublishedContent(db);
      await seedProviderRequests(db);
      const service = createGeoMonitoringService({
        db,
        gateway,
        publicSiteOrigin: "https://lingxi.ai",
        resolveModelProvider: async () => "deepseek",
        now: () => fixedNow,
      });

      const incompatible = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "tongyi",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(incompatible.status, 400);
      if ("error" in incompatible.body) assert.equal(incompatible.body.error.code, "geo_monitor_model_platform_mismatch");
      assert.equal(calls.length, 0);

      const completed = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(completed.status, 201);
      assert.equal(calls.length, 2);
      assert.ok(calls.every((call) => call.model === "deepseek-chat" && call.requestKeyPrefix?.startsWith("geo-monitor-deepseek-")));
      const runs = await db.query<{ status: string }>(`SELECT status FROM geo_monitor_runs ORDER BY created_at`);
      assert.deepEqual(runs.rows.map((row) => row.status), ["succeeded"]);
      const results = await db.query<{ result_status: string }>(`SELECT result_status FROM geo_monitor_results ORDER BY question_id`);
      assert.deepEqual(results.rows.map((row) => row.result_status), ["cited", "not_mentioned"]);
      const requestLinks = await db.query<{ provider_request_id: string | null }>(
        `SELECT provider_request_id FROM geo_monitor_results ORDER BY question_id`,
      );
      assert.deepEqual(requestLinks.rows.map((row) => row.provider_request_id), [...providerRequestIds]);

      const extraQuestionIds = Array.from({ length: 19 }, (_, index) =>
        `35000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`);
      await db.query(
        `INSERT INTO geo_questions (id,raw_question,normalized_question,topic,intent,created_by_admin_id,created_at,updated_at)
         SELECT id, '额外监测问题' || ordinality, '额外监测问题' || ordinality, 'AI分镜', 'tutorial', $2, $3, $3
           FROM unnest($1::uuid[]) WITH ORDINALITY AS extra(id, ordinality)`,
        [extraQuestionIds, adminId, fixedNow],
      );
      await db.query(
        `INSERT INTO geo_content_question_links (content_version_id,question_id)
         SELECT $1,id FROM unnest($2::uuid[]) AS extra(id)`,
        [versionId, extraQuestionIds],
      );
      const oversized = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(oversized.status, 400);
      if ("error" in oversized.body) assert.equal(oversized.body.error.code, "geo_monitor_question_limit_exceeded");
      assert.equal(calls.length, 2);
    } finally {
      await db.close();
    }
  });

  it("marks a failed official run without retaining partial question results", async () => {
    const db = await createMigratedTestDb();
    let callCount = 0;
    let failureMode: "invalid_json" | "provider" = "invalid_json";
    const gateway: GeoMonitoringGatewayLike = {
      async completeJson() {
        callCount += 1;
        if (callCount % 2 === 0) {
          if (failureMode === "invalid_json") return "not-json";
          throw new Error("provider unavailable");
        }
        return JSON.stringify({ answer: "灵曦AI", citedUrls: [] });
      },
    };
    try {
      await seedPublishedContent(db);
      const service = createGeoMonitoringService({
        db,
        gateway,
        publicSiteOrigin: "https://lingxi.ai",
        resolveModelProvider: async () => "deepseek",
        now: () => fixedNow,
      });
      const result = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(result.status, 409);
      if ("error" in result.body) assert.equal(result.body.error.code, "geo_monitor_output_invalid");
      failureMode = "provider";
      const providerFailure = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(providerFailure.status, 409);
      if ("error" in providerFailure.body) assert.equal(providerFailure.body.error.code, "geo_monitor_provider_failed");
      const runs = await db.query<{ status: string; error_code: string | null }>(`SELECT status,error_code FROM geo_monitor_runs`);
      assert.deepEqual(runs.rows.map((row) => row.status), ["failed", "failed"]);
      assert.deepEqual(new Set(runs.rows.map((row) => row.error_code)), new Set(["geo_monitor_output_invalid", "geo_monitor_provider_failed"]));
      const results = await db.query(`SELECT id FROM geo_monitor_results`);
      assert.equal(results.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  it("bounds stalled and oversized official provider responses", async () => {
    const db = await createMigratedTestDb();
    let timeoutSignal: AbortSignal | undefined;
    try {
      await seedPublishedContent(db);
      const timeoutService = createGeoMonitoringService({
        db,
        gateway: {
          async completeJson(input) {
            timeoutSignal = input.signal;
            return new Promise<string>((_resolve, reject) => {
              input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
            });
          },
        },
        resolveModelProvider: async () => "deepseek",
        providerCallTimeoutMs: 10,
        now: () => fixedNow,
      });
      const timeoutResult = await timeoutService.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(timeoutResult.status, 409);
      if ("error" in timeoutResult.body) assert.equal(timeoutResult.body.error.code, "geo_monitor_provider_timeout");
      assert.equal(timeoutSignal?.aborted, true);

      let responseLimit: number | undefined;
      const oversizedService = createGeoMonitoringService({
        db,
        gateway: {
          async completeJsonWithUsage(input) {
            responseLimit = input.maxResponseChars;
            throw Object.assign(new Error("provider_response_too_large"), { code: "provider_response_too_large" });
          },
          async completeJson() {
            throw new Error("unexpected fallback");
          },
        },
        resolveModelProvider: async () => "deepseek",
        now: () => fixedNow,
      });
      const oversizedResult = await oversizedService.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(oversizedResult.status, 409);
      if ("error" in oversizedResult.body) assert.equal(oversizedResult.body.error.code, "geo_monitor_output_invalid");
      assert.equal(responseLimit, 64_000);

      const runs = await db.query<{ status: string; error_code: string }>(
        "SELECT status,error_code FROM geo_monitor_runs ORDER BY created_at,id",
      );
      assert.deepEqual(new Set(runs.rows.map((row) => row.error_code)), new Set([
        "geo_monitor_provider_timeout",
        "geo_monitor_output_invalid",
      ]));
      assert.ok(runs.rows.every((row) => row.status === "failed"));
    } finally {
      await db.close();
    }
  });

  it("binds a run to the published version captured before a concurrent republish", async () => {
    const db = await createMigratedTestDb();
    const nextVersionId = "35000000-0000-4000-8000-000000000008";
    const nextQuestionId = "35000000-0000-4000-8000-000000000009";
    let callCount = 0;
    const gateway: GeoMonitoringGatewayLike = {
      async completeJson() {
        callCount += 1;
        if (callCount === 1) {
          await db.query(
            "UPDATE geo_content_items SET current_published_version_id=$2 WHERE id=$1",
            [contentId, nextVersionId],
          );
        }
        return JSON.stringify({ answer: "灵曦AI", citedUrls: [] });
      },
    };
    try {
      await seedPublishedContent(db);
      await db.query(
        `INSERT INTO geo_questions (id,raw_question,normalized_question,topic,intent,created_by_admin_id,created_at,updated_at)
         VALUES ($1,'新版本问题','新版本问题','AI分镜','tutorial',$2,$3,$3)`,
        [nextQuestionId, adminId, fixedNow],
      );
      await db.query(
        `INSERT INTO geo_content_versions (id,content_item_id,version_number,title,summary,document_json,config_revision_id,created_by_admin_id,created_at,published_at)
         VALUES ($1,$2,2,'新版AI分镜指南','新摘要','{}'::jsonb,'geo-default-v1',$3,$4,$4)`,
        [nextVersionId, contentId, adminId, fixedNow],
      );
      await db.query(
        "INSERT INTO geo_content_question_links (content_version_id,question_id) VALUES ($1,$2)",
        [nextVersionId, nextQuestionId],
      );
      const service = createGeoMonitoringService({
        db,
        gateway,
        publicSiteOrigin: "https://lingxi.ai",
        resolveModelProvider: async () => "deepseek",
        now: () => fixedNow,
      });

      const completed = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(completed.status, 201);
      const listed = await service.listForContent(contentId);
      assert.equal(listed.status, 200);
      if (!("data" in listed.body)) throw new Error("expected monitoring data");
      assert.equal(listed.body.data.content.publishedVersionId, nextVersionId);
      assert.deepEqual(listed.body.data.questions.map((item) => item.id), [nextQuestionId]);
      assert.equal(listed.body.data.runs[0]?.contentVersionId, versionId);
      assert.equal(listed.body.data.runs[0]?.results.length, 2);
    } finally {
      await db.close();
    }
  });

  it("rejects late official results after the run leaves running state", async () => {
    const db = await createMigratedTestDb();
    let callCount = 0;
    const gateway: GeoMonitoringGatewayLike = {
      async completeJson() {
        callCount += 1;
        if (callCount === 2) {
          await db.query(
            `UPDATE geo_monitor_runs SET status='failed',error_code='superseded',completed_at=$1,updated_at=$1
              WHERE status='running'`,
            [fixedNow],
          );
        }
        return JSON.stringify({ answer: "灵曦AI", citedUrls: [] });
      },
    };
    try {
      await seedPublishedContent(db);
      const service = createGeoMonitoringService({
        db,
        gateway,
        publicSiteOrigin: "https://lingxi.ai",
        resolveModelProvider: async () => "deepseek",
        now: () => fixedNow,
      });
      const result = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(result.status, 409);
      if ("error" in result.body) assert.equal(result.body.error.code, "geo_monitor_run_not_running");
      const rows = await db.query("SELECT id FROM geo_monitor_results");
      assert.equal(rows.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  it("fences concurrent official runs and recovers an abandoned running row", async () => {
    const db = await createMigratedTestDb();
    let releaseFirst!: () => void;
    let markEntered!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstEntered = new Promise<void>((resolve) => { markEntered = resolve; });
    let callCount = 0;
    const gateway: GeoMonitoringGatewayLike = {
      async completeJson() {
        callCount += 1;
        if (callCount === 1) {
          markEntered();
          await firstCanFinish;
        }
        return JSON.stringify({ answer: "灵曦AI", citedUrls: [] });
      },
    };
    try {
      await seedPublishedContent(db);
      const service = createGeoMonitoringService({
        db,
        gateway,
        publicSiteOrigin: "https://lingxi.ai",
        resolveModelProvider: async () => "deepseek",
        now: () => fixedNow,
      });
      const first = service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      await firstEntered;
      const concurrent = await service.runOfficialApi({
        contentItemId: contentId,
        platformId: "deepseek",
        modelCode: "deepseek-chat",
        actorAdminAccountId: adminId,
      });
      assert.equal(concurrent.status, 409);
      if ("error" in concurrent.body) assert.equal(concurrent.body.error.code, "geo_monitor_run_already_running");
      releaseFirst();
      assert.equal((await first).status, 201);

      const abandonedAt = new Date(fixedNow.getTime() - 31 * 60 * 1_000);
      await db.query(
        `INSERT INTO geo_monitor_runs (
           id,content_item_id,content_version_id,platform_id,source_type,status,model_code,created_by_admin_id,started_at,created_at,updated_at
         ) VALUES ('35000000-0000-4000-8000-000000000011',$1,$2,'tongyi','official_api','running','qwen-plus',$3,$4,$4,$4)`,
        [contentId, versionId, adminId, abandonedAt],
      );
      await service.listForContent(contentId);
      const recovered = await db.query<{ status: string; error_code: string | null }>(
        "SELECT status,error_code FROM geo_monitor_runs WHERE id='35000000-0000-4000-8000-000000000011'",
      );
      assert.deepEqual(recovered.rows[0], { status: "failed", error_code: "geo_monitor_stale_run" });
    } finally {
      releaseFirst?.();
      await db.close();
    }
  });
});

async function seedProviderRequests(db: { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }) {
  await db.query(
    `INSERT INTO provider_requests (
       id,provider_name,provider_operation,request_key,request_hash,payload_ref,payload_hash,status,created_at,updated_at
     )
     SELECT id,'deepseek','text_completion','geo-monitor-' || ordinality,'request-hash-' || ordinality,
            'inline','payload-hash-' || ordinality,'succeeded',$2,$2
       FROM unnest($1::uuid[]) WITH ORDINALITY AS request(id, ordinality)`,
    [[...providerRequestIds], fixedNow],
  );
}

async function seedPublishedContent(db: { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }) {
  await db.query(
    `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
     VALUES ($1,'geo_monitor_admin','plain:test-password','GEO Monitor Admin','active')`,
    [adminId],
  );
  await db.query(
    `INSERT INTO geo_questions (id,raw_question,normalized_question,topic,intent,created_by_admin_id,created_at,updated_at)
     VALUES
       ($1,'AI分镜工具哪个好？','ai分镜工具哪个好','AI分镜','comparison',$3,$4,$4),
       ($2,'怎么用AI生成分镜？','怎么用ai生成分镜','AI分镜','tutorial',$3,$4,$4)`,
    [questionIds[0], questionIds[1], adminId, fixedNow],
  );
  await db.query(
    `INSERT INTO geo_content_items (id,content_type,topic,slug,status,created_by_admin_id,updated_by_admin_id,created_at,updated_at)
     VALUES ($1,'guide','AI分镜','ai-storyboard-guide','draft',$2,$2,$3,$3)`,
    [contentId, adminId, fixedNow],
  );
  await db.query(
    `INSERT INTO geo_content_versions (id,content_item_id,version_number,title,summary,document_json,config_revision_id,created_by_admin_id,created_at,published_at)
     VALUES ($1,$2,1,'AI分镜指南','如何选择AI分镜工具','{}'::jsonb,'geo-default-v1',$3,$4,$4)`,
    [versionId, contentId, adminId, fixedNow],
  );
  await db.query(
    `INSERT INTO geo_content_question_links (content_version_id,question_id) VALUES ($1,$2),($1,$3)`,
    [versionId, questionIds[0], questionIds[1]],
  );
  await db.query(
    `UPDATE geo_content_items SET status='published',current_published_version_id=$2 WHERE id=$1`,
    [contentId, versionId],
  );
}
