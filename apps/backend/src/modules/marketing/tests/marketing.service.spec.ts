import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { MarketingError, buildMarketingMetricComparisons, createMarketingService } from "../application/marketing.service.ts";
import { QianFanHmacError, signQianFanV1Request, verifyQianFanHmac } from "../infrastructure/qianfan-hmac.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../../../entrypoints/phone-auth-dev-server.ts";
import type { StorageAdapter } from "../../storage/storage.service.ts";
import { routeMarketingHttpRequest } from "../http/marketing-http.ts";
import { MarketingGenerationWorker } from "../workers/marketing-generation.worker.ts";

describe("marketing MVP", () => {
  it("compares only like-for-like content metrics and labels insufficient samples", () => {
    const comparisons = buildMarketingMetricComparisons([
      {
        campaignId: "campaign-1", campaignName: "Campaign", objective: "views", platform: "douyin", executorAccountRef: "account-1",
        contentVariantId: "content-a", title: "A", metricName: "views", observationWindow: { hours: 24 }, sampleCount: 2, averageValue: 80,
      },
      {
        campaignId: "campaign-1", campaignName: "Campaign", objective: "views", platform: "douyin", executorAccountRef: "account-1",
        contentVariantId: "content-b", title: "B", metricName: "views", observationWindow: { hours: 24 }, sampleCount: "1", averageValue: "120",
      },
      {
        campaignId: "campaign-1", campaignName: "Campaign", objective: "views", platform: "douyin", executorAccountRef: "account-2",
        contentVariantId: "content-c", title: "C", metricName: "views", observationWindow: { hours: 24 }, sampleCount: 1, averageValue: 100,
      },
    ]);
    assert.equal(comparisons.length, 2);
    assert.deepEqual(comparisons[0], {
      campaignId: "campaign-1", campaignName: "Campaign", objective: "views", platform: "douyin", executorAccountRef: "account-1",
      metricName: "views", observationWindow: { hours: 24 }, sampleSize: 3, conclusion: "descriptive_comparison",
      variants: [
        { contentVariantId: "content-b", title: "B", sampleCount: 1, averageValue: 120 },
        { contentVariantId: "content-a", title: "A", sampleCount: 2, averageValue: 80 },
      ],
    });
    assert.equal(comparisons[1]?.conclusion, "insufficient_sample");
  });

  it("lists research briefs in the marketing console", async () => {
    const db = await createMigratedTestDb();
    try {
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const consoleData = await marketing.listConsole();

      assert.ok(Array.isArray(consoleData.researchBriefs));
      assert.deepEqual(consoleData.researchBriefs, []);
      assert.ok(Array.isArray(consoleData.agentUsage));
      assert.deepEqual(consoleData.agentUsage, []);
      assert.ok(Array.isArray(consoleData.agentProviderApprovals));
      assert.deepEqual(consoleData.agentProviderApprovals, []);
      assert.ok(Array.isArray(consoleData.contentVariants));
    } finally {
      await db.close();
    }
  });

  it("binds manual marketing projects to an explicit active execution owner and repairs legacy owner failures", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      await assert.rejects(
        () => marketing.createProject({ sourceType: "manual", sourceNamespace: "manual", sourceSnapshot: {}, name: "Unbound project" }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_execution_owner_not_configured",
      );
      await marketing.configureExecutionOwner(userId, adminId);
      const project = await marketing.createProject({ sourceType: "manual", sourceNamespace: "manual", sourceSnapshot: {}, name: "Bound project" }, adminId);
      const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const queued = await marketing.createDirectPublish({
        projectId: project.id, direction: "测试历史任务恢复", sourceFacts: "测试项目支持图片生成，恢复后可重新提交图片任务。", contentType: "image", platform: "douyin",
        executorAccountRef: "qianfan:test:account", idempotencyKey: `repair-owner-${randomUUID()}`, scheduledAt,
      }, adminId);
      await db.query("UPDATE marketing_projects SET owner_user_id = NULL WHERE id = $1", [project.id]);
      await db.query(
        "UPDATE marketing_generation_runs SET status = 'failed', failure_code = 'marketing_generation_owner_required' WHERE id = $1",
        [queued.generationRunId],
      );
      const repaired = await marketing.configureExecutionOwner(userId, adminId);
      assert.deepEqual(repaired, { ownerUserId: userId, repairedProjectCount: 1, retriedRunCount: 1 });
      const state = await db.query<{ owner_user_id: string; status: string; failure_code: string | null }>(
        `SELECT project.owner_user_id, run.status, run.failure_code
         FROM marketing_projects AS project
         JOIN marketing_generation_runs AS run ON run.project_id = project.id
         WHERE project.id = $1`,
        [project.id],
      );
      assert.deepEqual(state.rows[0], { owner_user_id: userId, status: "queued", failure_code: null });
    } finally {
      await db.close();
    }
  });

  it("queues an automatic generation run without a manual review", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const storageObjectId = await seedStorageObject(db, userId, "authorized video");
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "direct-publish-project",
        sourceSnapshot: { assets: [{ storageObjectId }] }, name: "Direct publish project",
      }, adminId);

      const result = await marketing.createDirectPublish({
        projectId: project.id, direction: "低价生视频广告推广", contentType: "video", platform: "douyin",
        executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey: `direct-publish-${randomUUID()}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);

      assert.equal(result.status, "queued");
      const [runs, jobs, reviews] = await Promise.all([
        db.query<{ status: string; campaign_id: string; direction: string }>(
          "SELECT status, campaign_id, direction FROM marketing_generation_runs WHERE id = $1", [result.generationRunId],
        ),
        db.query<{ count: number }>("SELECT count(*)::int AS count FROM marketing_publish_jobs"),
        db.query<{ count: number }>("SELECT count(*)::int AS count FROM marketing_content_manual_reviews"),
      ]);
      assert.equal(runs.rows[0]?.status, "queued");
      assert.equal(runs.rows[0]?.campaign_id, result.campaignId);
      assert.equal(runs.rows[0]?.direction, "低价生视频");
      assert.equal(jobs.rows[0]?.count, 0);
      assert.equal(reviews.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("requires plan and generated-media confirmation before creating a publish job", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const storageObjectId = await seedStorageObject(db, userId, "confirmed marketing video");
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "confirmation-project",
        sourceSnapshot: { synopsis: "原创作品介绍" }, name: "Confirmation project",
      }, adminId);
      const knowledgeSegmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "confirmation-knowledge");
      const created = await marketing.createDirectPublish({
        projectId: project.id, direction: "介绍原创故事的核心看点", sourceFacts: "原创故事讲述勇气与友谊，采用明亮手绘风格，适合短视频分镜展示。",
        contentType: "video", platform: "douyin",
        executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey: `confirmation-${randomUUID()}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);
      await db.query(
        `UPDATE marketing_generation_runs
         SET status = 'plan_ready', plan_json = $2::jsonb, knowledge_segment_ids_json = $3::jsonb
         WHERE id = $1`,
        [created.generationRunId, JSON.stringify({ title: "原创故事", copy: "真实介绍", script: "镜头脚本", mediaPrompt: "原创视频画面" }), JSON.stringify([knowledgeSegmentId])],
      );

      const planConfirmed = await marketing.confirmGenerationPlan(created.generationRunId, adminId);
      assert.deepEqual(planConfirmed, { id: created.generationRunId, status: "planning" });
      const beforeMediaConfirmation = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM marketing_publish_jobs");
      assert.equal(beforeMediaConfirmation.rows[0]?.count, 0);

      await db.query(
        `UPDATE marketing_generation_runs
         SET status = 'media_ready', media_asset_manifest_json = $2::jsonb
         WHERE id = $1`,
        [created.generationRunId, JSON.stringify([{ type: "video", storageObjectId, authorizationStatus: "owned" }])],
      );
      const planRegenerated = await marketing.regenerateGenerationRun(created.generationRunId, "plan", adminId);
      assert.deepEqual(planRegenerated, { id: created.generationRunId, status: "queued" });
      const afterPlanRegeneration = await db.query<{ status: string; plan_json: Record<string, unknown>; media_asset_manifest_json: unknown[] }>(
        "SELECT status, plan_json, media_asset_manifest_json FROM marketing_generation_runs WHERE id = $1", [created.generationRunId],
      );
      assert.deepEqual(afterPlanRegeneration.rows[0], { status: "queued", plan_json: {}, media_asset_manifest_json: [] });
      await db.query(
        `UPDATE marketing_generation_runs
         SET status = 'media_ready', plan_json = $2::jsonb, media_asset_manifest_json = $3::jsonb
         WHERE id = $1`,
        [created.generationRunId, JSON.stringify({ title: "原创故事", copy: "真实介绍", script: "镜头脚本", mediaPrompt: "原创视频画面" }), JSON.stringify([{ type: "video", storageObjectId, authorizationStatus: "owned" }])],
      );
      await marketing.registerExecutor({
        workerId: "qianfan-worker-1", version: "1.0.0",
        capabilities: {
          accounts: [{ platform: "douyin", executorAccountRef: "qianfan:worker-1:account-1", accountName: "悠然", status: "available" }],
          platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: true }],
        },
      });

      const mediaConfirmed = await marketing.confirmGeneratedMedia(created.generationRunId, adminId);
      assert.equal(mediaConfirmed.status, "scheduled");
      assert.ok(mediaConfirmed.publishJobId);
      const state = await db.query<{ status: string; publish_job_id: string | null }>(
        "SELECT status, publish_job_id FROM marketing_generation_runs WHERE id = $1", [created.generationRunId],
      );
      assert.deepEqual(state.rows[0], { status: "scheduled", publish_job_id: mediaConfirmed.publishJobId });
      const confirmedKnowledge = await db.query<{ status: string; content: string; source_locator: string | null }>(
        `SELECT document.status, segment.content, segment.source_locator
         FROM marketing_knowledge_documents AS document
         JOIN marketing_knowledge_segments AS segment ON segment.document_id = document.id
         WHERE document.project_id = $1 AND document.document_type = 'confirmed_generation' AND document.version = $2`,
        [project.id, `run-${created.generationRunId}`],
      );
      assert.equal(confirmedKnowledge.rows[0]?.status, "approved");
      assert.match(confirmedKnowledge.rows[0]?.content ?? "", /标题：原创故事/);
      assert.equal(confirmedKnowledge.rows[0]?.source_locator, `generation-run:${created.generationRunId}`);
    } finally {
      await db.close();
    }
  });

  it("resumes generated-media confirmation after content or publish-job preparation already succeeded", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const storageObjectId = await seedStorageObject(db, userId, "resumable marketing video");
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "resumable-confirmation-project",
        sourceSnapshot: { synopsis: "原创作品介绍" }, name: "Resumable confirmation project",
      }, adminId);
      const knowledgeSegmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "resumable-confirmation-knowledge");
      const created = await marketing.createDirectPublish({
        projectId: project.id, direction: "介绍原创故事的核心看点", sourceFacts: "原创故事讲述勇气与友谊，适合短视频分镜展示。",
        contentType: "video", platform: "douyin", executorAccountRef: "qianfan:worker-1:account-1",
        idempotencyKey: `resumable-confirmation-${randomUUID()}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);
      const plan = { title: "原创故事", copy: "真实介绍", script: "镜头脚本", mediaPrompt: "原创视频画面" };
      await db.query(
        `UPDATE marketing_generation_runs
         SET status = 'media_ready', plan_json = $2::jsonb, knowledge_segment_ids_json = $3::jsonb,
             media_asset_manifest_json = $4::jsonb
         WHERE id = $1`,
        [created.generationRunId, JSON.stringify(plan), JSON.stringify([knowledgeSegmentId]),
          JSON.stringify([{ type: "video", storageObjectId, authorizationStatus: "owned" }])],
      );
      await marketing.registerExecutor({
        workerId: "qianfan-worker-1", version: "1.0.0",
        capabilities: {
          accounts: [{ platform: "douyin", executorAccountRef: "qianfan:worker-1:account-1", accountName: "悠然", status: "available" }],
          platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: true }],
        },
      });
      await marketing.ensureDirectPublishPlatformProfile("douyin", "qianfan:worker-1:account-1", adminId);
      const existingContent = await marketing.createContentVariant({
        campaignId: created.campaignId, platform: "douyin", contentType: "video", title: plan.title, body: plan,
        assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
        knowledgeSegmentIds: [knowledgeSegmentId], complianceReport: {},
        trackingKey: `marketing-generation-${created.generationRunId}`,
      }, adminId);
      const compliance = await marketing.runComplianceCheck(existingContent.id, adminId);
      assert.equal(compliance.status, "passed");
      await marketing.approveContentVariant(existingContent.id, adminId);

      const firstConfirmation = await marketing.confirmGeneratedMedia(created.generationRunId, adminId);
      assert.equal(firstConfirmation.contentVariantId, existingContent.id);
      assert.ok(firstConfirmation.publishJobId);

      await db.query(
        `UPDATE marketing_generation_runs
         SET status = 'media_ready', content_variant_id = NULL, publish_job_id = NULL
         WHERE id = $1`,
        [created.generationRunId],
      );
      const secondConfirmation = await marketing.confirmGeneratedMedia(created.generationRunId, adminId);
      assert.equal(secondConfirmation.contentVariantId, existingContent.id);
      assert.equal(secondConfirmation.publishJobId, firstConfirmation.publishJobId);
      const counts = await db.query<{ content_count: number; job_count: number }>(
        `SELECT
           (SELECT count(*)::int FROM marketing_content_variants WHERE tracking_key = $1) AS content_count,
           (SELECT count(*)::int FROM marketing_publish_jobs WHERE idempotency_key = $2) AS job_count`,
        [`marketing-generation-${created.generationRunId}`, `marketing-generation-publish:${created.generationRunId}`],
      );
      assert.deepEqual(counts.rows[0], { content_count: 1, job_count: 1 });
    } finally {
      await db.close();
    }
  });

  it("queues automatic generation even when a project has no existing media", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "empty-direct-publish-project",
        sourceSnapshot: {}, name: "Empty direct publish project",
      }, adminId);

      const result = await marketing.createDirectPublish({
        projectId: project.id, direction: "无素材也要从文字生成图文", sourceFacts: "输入文字描述后可生成一张图文配图，适合没有现成素材的创作场景。", contentType: "image", platform: "douyin",
        executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey: `direct-publish-empty-${randomUUID()}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);
      assert.equal(result.status, "queued");
      const jobs = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM marketing_publish_jobs");
      assert.equal(jobs.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("lists described marketing and video skills and snapshots both outside project knowledge", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "video-skill-project",
        sourceSnapshot: { projectName: "灵曦AI" }, name: "Video skill project",
      }, adminId);
      const consoleData = await marketing.listDirectConsole();
      const skills = consoleData.generationSkills as Array<{ id: string; code: string; name: string; description: string; skillKind: string }>;
      assert.equal(skills.length, 4);
      assert.ok(skills.every((skill) => skill.name && skill.description));
      assert.equal(skills.filter((skill) => skill.skillKind === "marketing").length, 2);
      assert.equal(skills.filter((skill) => skill.skillKind === "video").length, 2);
      const selectedMarketing = skills.find((skill) => skill.code === "short-video-hook");
      const selectedVideo = skills.find((skill) => skill.code === "storyboard-continuity");
      assert.ok(selectedMarketing);
      assert.ok(selectedVideo);
      const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const idempotencyKey = `video-skill-${randomUUID()}`;
      const created = await marketing.createDirectPublish({
        projectId: project.id, direction: "介绍低价视频生成", sourceFacts: "视频生成支持按秒计费。",
        marketingSkillId: selectedMarketing.id, skillId: selectedVideo.id, contentType: "video", platform: "douyin",
        executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey, scheduledAt,
      }, adminId);
      const run = await db.query<{
        source_snapshot: Record<string, unknown>;
        marketing_skill_snapshot_json: Record<string, unknown>;
        skill_snapshot_json: Record<string, unknown>;
      }>(
        "SELECT source_snapshot, marketing_skill_snapshot_json, skill_snapshot_json FROM marketing_generation_runs WHERE id = $1",
        [created.generationRunId],
      );
      assert.equal(run.rows[0]?.marketing_skill_snapshot_json.skillId, selectedMarketing.id);
      assert.equal(run.rows[0]?.marketing_skill_snapshot_json.name, selectedMarketing.name);
      assert.equal(run.rows[0]?.marketing_skill_snapshot_json.description, selectedMarketing.description);
      assert.equal(run.rows[0]?.skill_snapshot_json.skillId, selectedVideo.id);
      assert.equal(run.rows[0]?.skill_snapshot_json.name, selectedVideo.name);
      assert.equal(run.rows[0]?.skill_snapshot_json.description, selectedVideo.description);
      assert.equal(typeof run.rows[0]?.skill_snapshot_json.contentSha256, "string");
      assert.equal("planningInstruction" in (run.rows[0]?.source_snapshot ?? {}), false);
      const otherMarketingSkill = skills.find((skill) => skill.code === "marketing-copy-frameworks");
      assert.ok(otherMarketingSkill);
      await assert.rejects(
        () => marketing.createDirectPublish({
          projectId: project.id, direction: "介绍低价视频生成", sourceFacts: "视频生成支持按秒计费。",
          marketingSkillId: otherMarketingSkill.id, skillId: selectedVideo.id, contentType: "video", platform: "douyin",
          executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey, scheduledAt,
        }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_generation_idempotency_conflict",
      );
    } finally {
      await db.close();
    }
  });

  it("writes owned project knowledge before automatic media generation", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "automatic-knowledge-project",
        sourceSnapshot: { synopsis: "一部关于勇气和友谊的原创短篇", style: "明亮手绘" }, name: "Automatic knowledge project",
      }, adminId);
      const reusableSegmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "douyin-methodology");
      const unrelatedConfirmed = await marketing.createKnowledgeDocument({
        projectId: project.id, title: "Unrelated confirmed content", documentType: "confirmed_generation",
        version: "v1", authorizationStatus: "owned", content: "已确认宠物烘焙短片，展示面团整形、烤箱烘焙和宠物品尝。",
        applicablePlatforms: ["douyin"], confidenceScore: 95,
      }, adminId);
      await marketing.approveKnowledgeDocument(unrelatedConfirmed.id, adminId);
      const created = await marketing.createDirectPublish({
        projectId: project.id, direction: "突出主角克服困难的瞬间", sourceFacts: "灵曦AI 提供分镜画布、图像生成和视频生成。新手可先在画布整理分镜，再选择低成本模型生成图片或短视频。",
        contentType: "image", platform: "douyin",
        executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey: `automatic-knowledge-${randomUUID()}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);
      let plannedKnowledge = "";
      let plannedKnowledgeSegmentIds: string[] = [];
      const worker = new MarketingGenerationWorker({
        db,
        plan: async ({ knowledge, knowledgeSegmentIds }) => {
          plannedKnowledge = knowledge;
          plannedKnowledgeSegmentIds = knowledgeSegmentIds;
          return {
          output: {
            title: "用画布完成分镜再生成短视频", copy: "灵曦AI 将分镜整理、图像生成和视频生成放在同一条创作流程里。新手先在画布写清镜头目标，再按镜头选择图像或视频生成，减少来回切换工具的时间。完成后可以在同一项目继续调整分镜顺序、画面描述和视频时长，直到得到适合发布的短片。",
            script: "镜头1：展示空白画布和三格分镜，旁白说明先写清每个镜头的目标。\n镜头2：在第二格选择图像生成，展示生成结果进入画布，并标出该镜头的画面说明。\n镜头3：选择视频生成并预览短片，旁白说明可以继续调整分镜、时长和画面节奏。",
            mediaPrompt: "创作者坐在明亮工作台前使用灵曦AI画布，屏幕展示三格分镜、图像生成结果和视频预览。镜头1从空白画布推近三格分镜；镜头2特写生成结果放入第二格；镜头3拉远展示视频预览与完整分镜。干净界面，稳定镜头，自然光。",
          },
          knowledgeSegmentIds: [reusableSegmentId],
          };
        },
      });
      const result = await worker.processNext();
      assert.equal(result?.status, "plan_ready");
      const run = await db.query<{
        status: string; knowledge_document_id: string | null; derived_knowledge_document_id: string | null; knowledge_segment_ids_json: string[];
      }>("SELECT status, knowledge_document_id, derived_knowledge_document_id, knowledge_segment_ids_json FROM marketing_generation_runs WHERE id = $1", [created.generationRunId]);
      assert.equal(run.rows[0]?.status, "plan_ready");
      assert.ok(run.rows[0]?.knowledge_document_id);
      assert.ok(run.rows[0]?.derived_knowledge_document_id);
      assert.ok(plannedKnowledge.includes("verified project fact"));
      assert.ok(plannedKnowledge.includes("灵曦AI 提供分镜画布、图像生成和视频生成"));
      assert.ok(!plannedKnowledge.includes("本项目"));
      assert.ok(!plannedKnowledge.includes("宠物烘焙"));
      assert.ok(plannedKnowledgeSegmentIds.includes(reusableSegmentId));
      assert.ok(run.rows[0]?.knowledge_segment_ids_json.includes(reusableSegmentId));
      assert.equal(run.rows[0]?.knowledge_segment_ids_json.length, 3);
      await db.query(
        "UPDATE marketing_generation_runs SET status = 'failed', failure_code = 'marketing_generation_owner_required' WHERE id = $1",
        [created.generationRunId],
      );
      await marketing.retryGenerationRun(created.generationRunId, adminId);
      const resumed = await new MarketingGenerationWorker({
        db,
        plan: async () => { throw new Error("existing plan must be reused"); },
      }).processNext();
      assert.deepEqual(resumed, { runId: created.generationRunId, status: "plan_ready" });
    } finally {
      await db.close();
    }
  });

  it("rejects internal project narration and disconnected abstract visual filler", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "bad-copy-regression",
        sourceSnapshot: { projectName: "灵曦AI" }, name: "Bad copy regression",
      }, adminId);
      const created = await marketing.createDirectPublish({
        projectId: project.id, direction: "sd2.5 低价 7毛1秒", sourceFacts: "SD2.5 视频生成价格为每秒七毛。",
        contentType: "image", platform: "douyin", executorAccountRef: "qianfan:worker-1:account-1",
        idempotencyKey: `bad-copy-${randomUUID()}`, scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);
      const result = await new MarketingGenerationWorker({
        db,
        plan: async ({ knowledgeSegmentIds }) => ({
          output: {
            title: "SD2.5每秒七毛，价格信息直观呈现",
            copy: "还在按几块钱一秒使用SD2.5吗？本项目给出的价格是七毛一秒。画面依次呈现较高成本意象、七毛一秒的旁白说明与生成结果，用清晰的三段结构展示价格差异，全程采用原创视觉表达。",
            script: "1. 画面动作：多枚无标记筹码逐个落下并堆叠。旁白说明价格。\n2. 画面动作：筹码滑入抽象生成装置，彩色光流展开。旁白说明本项目价格。\n3. 画面动作：无文字图像依次展开，用三段结构展示结果。",
            mediaPrompt: "主体为无标记筹码、抽象影像生成装置与无文字图像卡片。动作包括筹码堆叠、单枚筹码滑入装置和彩色光流生成图像。环境为简洁深色摄影棚，使用柔和轮廓光与干净背景。第一镜筹码堆叠，第二镜筹码进入抽象生成装置，第三镜图像卡片依次展开。电影感布光，稳定运镜，纯视觉画面，无文字、数字、名称、标识、水印或二维码。",
          },
          knowledgeSegmentIds: [knowledgeSegmentIds[0]!],
        }),
      }).processNext();
      assert.deepEqual(result, {
        runId: created.generationRunId, status: "failed", failureCode: "marketing_text_plan_generic_placeholder",
      });
    } finally {
      await db.close();
    }
  });

  it("cancels an automatic run before it can dispatch a media task", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "cancel-automatic-run",
        sourceSnapshot: { synopsis: "取消前不应产生发布任务" }, name: "Cancel automatic run",
      }, adminId);
      const created = await marketing.createDirectPublish({
        projectId: project.id, direction: "取消测试", sourceFacts: "取消前仅创建图片生成任务，不产生对外发布内容。", contentType: "image", platform: "douyin",
        executorAccountRef: "qianfan:worker-1:account-1", idempotencyKey: `cancel-automatic-${randomUUID()}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, adminId);
      const canceled = await marketing.cancelGenerationRun(created.generationRunId, adminId, "运营取消");
      assert.equal(canceled.status, "canceled");
      const result = await new MarketingGenerationWorker({ db }).processNext();
      assert.equal(result, null);
      const jobs = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM marketing_publish_jobs");
      assert.equal(jobs.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("rejects approved knowledge that is not applicable to the content platform", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "platform-knowledge-project",
        sourceSnapshot: {}, name: "Platform knowledge project",
      }, adminId);
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Platform knowledge campaign", objective: "views" }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "platform-knowledge-source");
      await db.query(
        `UPDATE marketing_knowledge_documents
         SET applicable_platforms_json = '["xiaohongshu"]'::jsonb
         WHERE id = (SELECT document_id FROM marketing_knowledge_segments WHERE id = $1)`,
        [segmentId],
      );
      await assert.rejects(
        () => marketing.createContentVariant({
          campaignId: campaign.id, platform: "douyin", contentType: "video", title: "Platform-scoped evidence",
          body: { description: "A factual description" }, knowledgeSegmentIds: [segmentId], assetManifest: [],
          trackingKey: `platform-knowledge-${randomUUID()}`,
        }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_knowledge_segment_scope_invalid",
      );
    } finally {
      await db.close();
    }
  });

  it("requires minimized public or internal data before approving a text provider", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const approval = await marketing.saveAgentProviderApproval({
        providerName: "marketing-text-gateway", modelCode: "marketing-text-model", stage: "strategy",
        approvalReference: "MKT-APP-1", dataClassifications: ["public", "internal"],
        allowedInputPaths: ["runInput.publicBrief", "knowledgeSegments"], status: "approved",
      }, adminId);
      assert.equal(approval.status, "approved");
      const consoleData = await marketing.listConsole();
      assert.equal(consoleData.agentProviderApprovals[0]?.modelCode, "marketing-text-model");
      await assert.rejects(
        () => marketing.saveAgentProviderApproval({
          providerName: "marketing-text-gateway", modelCode: "marketing-text-model", stage: "copy",
          approvalReference: "MKT-APP-2", dataClassifications: ["restricted"], allowedInputPaths: ["runInput.secret"], status: "approved",
        }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_agent_provider_classification_invalid",
      );
    } finally {
      await db.close();
    }
  });

  it("persists a complete component admission record separately from model approval", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const component = await marketing.saveComponentAdmission({
        componentType: "model", componentName: "marketing-text-model", componentVersion: "2026-08",
        approvalReference: "CMP-APP-1", licenseSummary: "Commercial text model license verified.",
        commercialUseTerms: "Marketing generation is permitted.", dataProcessingLocation: "Approved provider region.",
        securitySummary: "Security review completed.", upgradePlan: "Review quarterly.", removalPlan: "Disable provider and revoke approval.",
        status: "approved",
      }, adminId);
      assert.equal(component.status, "approved");
      const consoleData = await marketing.listConsole();
      assert.equal(consoleData.componentAdmissions[0]?.componentName, "marketing-text-model");
    } finally {
      await db.close();
    }
  });

  it("schedules executor key retirement without receiving the key secret", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      await marketing.registerExecutor({
        workerId: "rotation-worker", version: "1.0.0", capabilities: {}, keyId: "old-key", keyFingerprint: "fingerprint-only",
      });
      const validUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const scheduled = await marketing.scheduleExecutorKeyRetirement({ workerId: "rotation-worker", keyId: "old-key", validUntil }, adminId);
      assert.equal(scheduled.keyId, "old-key");
      const stored = await db.query<{ valid_until: Date }>(
        `SELECT key.valid_until FROM marketing_executor_keys AS key
         JOIN marketing_executors AS executor ON executor.id = key.executor_id
         WHERE executor.worker_id = 'rotation-worker' AND key.key_id = 'old-key'`,
      );
      assert.equal(new Date(stored.rows[0]!.valid_until).getTime(), new Date(validUntil).getTime());
      await assert.rejects(
        () => marketing.scheduleExecutorKeyRetirement({ workerId: "rotation-worker", keyId: "old-key", validUntil: new Date(Date.now() - 1_000).toISOString() }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_executor_key_retirement_time_invalid",
      );
    } finally {
      await db.close();
    }
  });

  it("versions brand profiles and rechecks unpublished content after activation", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "brand-version-project",
        sourceSnapshot: {}, name: "Brand version project", brandProfile: { prohibitedExpressions: ["旧禁词"] },
      }, adminId);
      const initial = await marketing.listBrandProfiles(project.id);
      assert.equal(initial.length, 1);
      assert.equal(initial[0]?.status, "active");
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Brand version campaign", objective: "views" }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "brand-version-source");
      await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "brand-version-v1", capability: { video: true }, rules: {} }, adminId);
      const content = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "Original title",
        body: { description: "Supported content.", disclosures: [] }, knowledgeSegmentIds: [segmentId],
        assetManifest: [], trackingKey: `brand-version-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(content.id, adminId);
      await marketing.approveContentVariant(content.id, adminId);
      const draft = await marketing.createBrandProfileVersion({
        projectId: project.id, version: "v2", profile: { prohibitedExpressions: ["新禁词"], requiresDisclosure: true },
      }, adminId);
      await marketing.activateBrandProfile(draft.id, adminId);
      const stale = await db.query<{ status: string }>("SELECT status FROM marketing_content_variants WHERE id = $1", [content.id]);
      assert.equal(stale.rows[0]?.status, "stale");
      await assert.rejects(
        () => marketing.createBrandProfileVersion({ projectId: project.id, version: "v2", profile: {} }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_brand_profile_version_exists",
      );
      const renewedCampaign = await marketing.createCampaign({ projectId: project.id, name: "Brand version recheck", objective: "views" }, adminId);
      const renewed = await marketing.createContentVariant({
        campaignId: renewedCampaign.id, platform: "douyin", contentType: "video", title: "新禁词",
        body: { description: "Supported content.", disclosures: [] }, knowledgeSegmentIds: [segmentId],
        assetManifest: [], trackingKey: `brand-version-renewed-${randomUUID()}`,
      }, adminId);
      const compliance = await marketing.runComplianceCheck(renewed.id, adminId);
      assert.equal(compliance.status, "manual_review_required");
    } finally {
      await db.close();
    }
  });

  it("requires manual review when a project reuses highly similar marketing copy", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "similarity-project",
        sourceSnapshot: {}, name: "Similarity project",
      }, adminId);
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Similarity campaign", objective: "views" }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "similarity-source");
      await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "similarity-v1", capability: { video: true }, rules: {} }, adminId);
      const duplicateBody = { description: "三分钟了解原创漫画幕后制作流程和角色设计思路。", disclosures: [] };
      await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "原创漫画幕后制作流程",
        body: duplicateBody, knowledgeSegmentIds: [segmentId], assetManifest: [], trackingKey: `similarity-first-${randomUUID()}`,
      }, adminId);
      const candidate = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "原创漫画幕后制作流程",
        body: duplicateBody, knowledgeSegmentIds: [segmentId], assetManifest: [], trackingKey: `similarity-second-${randomUUID()}`,
      }, adminId);

      const compliance = await marketing.runComplianceCheck(candidate.id, adminId);
      assert.equal(compliance.status, "manual_review_required");
      assert.ok(compliance.findings.some((finding) => finding.code === "content_similarity_high"));
    } finally {
      await db.close();
    }
  });

  it("requires an approved compliant variant and preserves one publish lifecycle", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "project-1",
        sourceSnapshot: { name: "A compliant project" }, name: "A compliant project",
      }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "source-1");
      const storageObjectId = await seedStorageObject(db, userId, "asset");
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Launch", objective: "views" }, adminId);
      await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "test-v1", capability: { video: true }, rules: {} }, adminId);
      const content = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "A verified title",
        body: { description: "A factual description" }, knowledgeSegmentIds: [segmentId],
        assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
        complianceReport: { passed: true }, trackingKey: `track-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(content.id, adminId);
      await marketing.approveContentVariant(content.id, adminId);
      const now = Date.now();
      const publishInput = {
        campaignId: campaign.id, contentVariantId: content.id, platform: "douyin", executorAccountRef: "douyin-account-1",
        idempotencyKey: `publish-${randomUUID()}`, scheduledAt: new Date(now + 10 * 60 * 1000).toISOString(),
        assets: [{ type: "video" as const, storageObjectId }],
      };
      await assert.rejects(
        () => marketing.createPublishJob({ ...publishInput, idempotencyKey: `empty-assets-${randomUUID()}`, assets: [] }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_publish_assets_not_approved",
      );
      const publishJob = await marketing.createPublishJob(publishInput, adminId);
      const duplicatePublishJob = await marketing.createPublishJob(publishInput, adminId);
      assert.deepEqual(duplicatePublishJob, { ...publishJob, idempotent: true });
      await assert.rejects(
        marketing.createPublishJob({ ...publishInput, executorAccountRef: "different-account" }, adminId),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "marketing_publish_idempotency_conflict",
      );
      await db.query("UPDATE marketing_publish_jobs SET status = 'preparing_assets' WHERE id = $1", [publishJob.id]);
      await db.query("UPDATE marketing_delivery_assets SET delivery_state = 'copying' WHERE publish_job_id = $1", [publishJob.id]);
      const resumedPublishJob = await marketing.createPublishJob(publishInput, adminId);
      assert.equal(resumedPublishJob.id, publishJob.id);
      assert.equal(resumedPublishJob.status, "scheduled");
      assert.equal(resumedPublishJob.idempotent, true);
      await marketing.registerExecutor({
        workerId: "qianfan-test", version: "1.0.0",
        capabilities: {
          platforms: [{ platform: "douyin", accountRefs: ["douyin-account-1"] }],
          platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: false }],
        },
      });
      const job = await marketing.claimNext("qianfan-test", new Date(now));
      assert.ok(job);
      assert.equal(job.jobId, publishJob.id);
      assert.equal(job.assets.length, 1);
      await marketing.acknowledge("qianfan-test", job.jobId, job.attemptId);
      await marketing.reportEvent("qianfan-test", job.jobId, {
        attemptId: job.attemptId, eventId: randomUUID(), status: "running", occurredAt: new Date().toISOString(),
      });
      await assert.rejects(() => marketing.reportEvent("qianfan-test", job.jobId, {
        attemptId: job.attemptId, eventId: randomUUID(), status: "succeeded", occurredAt: new Date().toISOString(),
      }), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_publish_result_incomplete");
      const completionEventId = randomUUID();
      const complete = await marketing.reportEvent("qianfan-test", job.jobId, {
        attemptId: job.attemptId, eventId: completionEventId, status: "succeeded", occurredAt: new Date().toISOString(),
        platformContentId: "douyin-content-1", publishUrl: "https://www.douyin.com/video/1", publishedAt: new Date().toISOString(),
      });
      assert.equal(complete.status, "succeeded");
      const duplicate = await marketing.reportEvent("qianfan-test", job.jobId, {
        attemptId: job.attemptId, eventId: completionEventId, status: "succeeded", occurredAt: new Date().toISOString(),
        platformContentId: "douyin-content-1", publishUrl: "https://www.douyin.com/video/1", publishedAt: new Date().toISOString(),
      });
      assert.equal(duplicate.idempotent, true);
      const stored = await db.query<{ status: string; publish_url: string }>(
        `SELECT delivery.status, delivery.publish_url
         FROM marketing_publish_deliveries AS delivery
         WHERE delivery.publish_job_id = $1`,
        [publishJob.id],
      );
      assert.deepEqual(stored.rows[0], { status: "succeeded", publish_url: "https://www.douyin.com/video/1" });
      const published = await db.query<{ status: string }>("SELECT status FROM marketing_content_variants WHERE id = $1", [content.id]);
      assert.equal(published.rows[0]?.status, "published");

      const attentionJob = await marketing.createPublishJob({
        campaignId: campaign.id, contentVariantId: content.id, platform: "douyin", executorAccountRef: "douyin-account-1",
        idempotencyKey: `attention-${randomUUID()}`, scheduledAt: new Date(now + 10 * 60 * 1000).toISOString(),
        assets: [{ type: "video", storageObjectId }],
      }, adminId);
      const attentionDelivery = await marketing.claimNext("qianfan-test", new Date(now));
      assert.ok(attentionDelivery);
      assert.equal(attentionDelivery.jobId, attentionJob.id);
      await marketing.acknowledge("qianfan-test", attentionDelivery.jobId, attentionDelivery.attemptId);
      await marketing.reportEvent("qianfan-test", attentionDelivery.jobId, {
        attemptId: attentionDelivery.attemptId, eventId: randomUUID(), status: "running", occurredAt: new Date().toISOString(),
      });
      await marketing.reportEvent("qianfan-test", attentionDelivery.jobId, {
        attemptId: attentionDelivery.attemptId, eventId: randomUUID(), status: "needs_attention", occurredAt: new Date().toISOString(),
        failureCode: "account_login_required",
      });
      const attention = await db.query<{ id: string; owner_admin_id: string; due_at: Date; status: string }>(
        "SELECT id, owner_admin_id, due_at, status FROM marketing_attention_cases WHERE publish_job_id = $1",
        [attentionJob.id],
      );
      assert.equal(attention.rows[0]?.owner_admin_id, adminId);
      assert.equal(attention.rows[0]?.status, "open");
      assert.ok(attention.rows[0]?.due_at > new Date());
      await marketing.resolveAttentionCase(attention.rows[0]!.id, "账号已由运营人员重新登录", adminId);
      const resolved = await db.query<{ status: string; resolution: string }>(
        "SELECT status, resolution FROM marketing_attention_cases WHERE id = $1",
        [attention.rows[0]!.id],
      );
      assert.deepEqual(resolved.rows[0], { status: "resolved", resolution: "账号已由运营人员重新登录" });

      const cancelJob = await marketing.createPublishJob({
        campaignId: campaign.id, contentVariantId: content.id, platform: "douyin", executorAccountRef: "douyin-account-1",
        idempotencyKey: `cancel-${randomUUID()}`, scheduledAt: new Date(now + 10 * 60 * 1000).toISOString(),
        assets: [{ type: "video", storageObjectId }],
      }, adminId);
      const cancelDelivery = await marketing.claimNext("qianfan-test", new Date(now));
      assert.ok(cancelDelivery);
      assert.equal(cancelDelivery.jobId, cancelJob.id);
      await marketing.acknowledge("qianfan-test", cancelJob.id, cancelDelivery.attemptId);
      await marketing.reportEvent("qianfan-test", cancelJob.id, {
        attemptId: cancelDelivery.attemptId, eventId: randomUUID(), status: "queued", occurredAt: new Date().toISOString(),
      });
      await marketing.cancelPublishJob(cancelJob.id, adminId, "管理员撤销排期");
      const cancelState = await marketing.cancelState("qianfan-test", cancelJob.id, cancelDelivery.attemptId);
      assert.equal(cancelState.canceled, true);
      await assert.rejects(() => marketing.reportEvent("qianfan-test", cancelJob.id, {
        attemptId: cancelDelivery.attemptId, eventId: randomUUID(), status: "running", occurredAt: new Date().toISOString(),
      }), (error: unknown) => error instanceof Error && "code" in error && error.code === "marketing_delivery_job_frozen");
    } finally {
      await db.close();
    }
  });

  it("recovers an expired pre-submit lease but fences an expired running delivery", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "lease-project",
        sourceSnapshot: {}, name: "Lease recovery project",
      }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "lease-source");
      const storageObjectId = await seedStorageObject(db, userId, "lease-asset");
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Lease recovery", objective: "views" }, adminId);
      await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "lease-test-v1", capability: { video: true }, rules: {} }, adminId);
      const content = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", body: {},
        knowledgeSegmentIds: [segmentId],
        assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
        complianceReport: { passed: true }, trackingKey: `lease-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(content.id, adminId);
      await marketing.approveContentVariant(content.id, adminId);
      const now = Date.now();
      const publishJob = await marketing.createPublishJob({
        campaignId: campaign.id, contentVariantId: content.id, platform: "douyin", executorAccountRef: "douyin-account-lease",
        idempotencyKey: `lease-job-${randomUUID()}`, scheduledAt: new Date(now).toISOString(),
        assets: [{ type: "video", storageObjectId }],
      }, adminId);
      await marketing.registerExecutor({
        workerId: "qianfan-lease", version: "1.0.0",
        capabilities: {
          platforms: [{ platform: "douyin", accountRefs: ["douyin-account-lease"] }],
          platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: false }],
        },
      });

      const firstAttempt = await marketing.claimNext("qianfan-lease", new Date(now));
      assert.ok(firstAttempt);
      const recoveredAttempt = await marketing.claimNext("qianfan-lease", new Date(now + 6 * 60 * 1000));
      assert.ok(recoveredAttempt);
      assert.notEqual(recoveredAttempt.attemptId, firstAttempt.attemptId);
      const expiredDelivery = await db.query<{ status: string; failure_code: string }>(
        "SELECT status, failure_code FROM marketing_publish_deliveries WHERE attempt_id = $1",
        [firstAttempt.attemptId],
      );
      assert.deepEqual(expiredDelivery.rows[0], { status: "failed", failure_code: "lease_expired" });

      await marketing.acknowledge("qianfan-lease", publishJob.id, recoveredAttempt.attemptId);
      await marketing.reportEvent("qianfan-lease", publishJob.id, {
        attemptId: recoveredAttempt.attemptId, eventId: randomUUID(), status: "running", occurredAt: new Date().toISOString(),
      });
      const blocked = await marketing.claimNext("qianfan-lease", new Date(now + 12 * 60 * 1000));
      assert.equal(blocked, null);
      const fenced = await db.query<{ status: string }>("SELECT status FROM marketing_publish_jobs WHERE id = $1", [publishJob.id]);
      assert.equal(fenced.rows[0]?.status, "result_unknown");
    } finally {
      await db.close();
    }
  });

  it("records one immutable high-risk manual approval with all review dimensions", async () => {
    const db = await createMigratedTestDb();
    try {
      const fixture = await seedManualReviewFixture(db, "manual-approve");
      const dimensions = { facts: true, assetRights: true, disclosure: true, platformRules: true };
      await assert.rejects(() => fixture.marketing.reviewContentVariant({
        contentVariantId: fixture.contentId,
        decision: "approve",
        reviewDimensions: { ...dimensions, disclosure: false },
        notes: "Reviewed against the approved evidence.",
        idempotencyKey: "manual-review-approve",
      }, fixture.adminId), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_manual_review_dimensions_incomplete");

      const approved = await fixture.marketing.reviewContentVariant({
        contentVariantId: fixture.contentId,
        decision: "approve",
        reviewDimensions: dimensions,
        notes: "Reviewed against the approved evidence.",
        idempotencyKey: "manual-review-approve",
      }, fixture.adminId);
      assert.equal(approved.status, "approved");
      assert.equal(approved.idempotent, false);

      const duplicate = await fixture.marketing.reviewContentVariant({
        contentVariantId: fixture.contentId,
        decision: "approve",
        reviewDimensions: dimensions,
        notes: "Reviewed against the approved evidence.",
        idempotencyKey: "manual-review-approve",
      }, fixture.adminId);
      assert.equal(duplicate.reviewId, approved.reviewId);
      assert.equal(duplicate.idempotent, true);
      await assert.rejects(() => fixture.marketing.reviewContentVariant({
        contentVariantId: fixture.contentId,
        decision: "approve",
        reviewDimensions: dimensions,
        notes: "Different decision evidence.",
        idempotencyKey: "manual-review-approve",
      }, fixture.adminId), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_manual_review_idempotency_conflict");

      const stored = await db.query<{
        decision: string; review_dimensions_json: Record<string, boolean>; evidence_snapshot_json: Record<string, unknown>;
      }>(
        `SELECT decision, review_dimensions_json, evidence_snapshot_json
         FROM marketing_content_manual_reviews WHERE content_variant_id = $1`,
        [fixture.contentId],
      );
      assert.equal(stored.rows.length, 1);
      assert.equal(stored.rows[0]?.decision, "approve");
      assert.deepEqual(stored.rows[0]?.review_dimensions_json, dimensions);
      assert.equal(stored.rows[0]?.evidence_snapshot_json.complianceCheckId, fixture.complianceCheckId);
      const audit = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM marketing_audit_events
         WHERE content_variant_id = $1 AND event_type = 'content.manual_review_approved'`,
        [fixture.contentId],
      );
      assert.equal(audit.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("requires manual review for configured disclosure and platform limits", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "platform-rules-project",
        sourceSnapshot: {}, name: "Platform rules project",
      }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "platform-rules-source");
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Platform rules campaign", objective: "views" }, adminId);
      await marketing.savePlatformCapabilityProfile({
        platform: "douyin", version: "platform-rules-v1", capability: { video: true },
        rules: { requiresDisclosure: true, maxTags: 1, maxTitleLength: 24, maxDescriptionLength: 80 },
      }, adminId);
      const content = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "Configured platform restriction",
        body: { description: "A factual description.", tags: ["one", "two"], disclosures: [] },
        knowledgeSegmentIds: [segmentId], assetManifest: [{ type: "video", authorizationStatus: "owned" }],
        trackingKey: `platform-rules-${randomUUID()}`,
      }, adminId);
      const result = await marketing.runComplianceCheck(content.id, adminId);
      assert.equal(result.status, "manual_review_required");
      assert.ok(result.findings.some((finding) => finding.code === "disclosure_missing"));
      assert.ok(result.findings.some((finding) => finding.code === "platform_tag_limit_exceeded"));
      assert.ok(result.findings.some((finding) => finding.code === "platform_tags_unsupported"));
      await assert.rejects(() => marketing.approveContentVariant(content.id, adminId), (error: unknown) => (
        error instanceof Error && "code" in error && error.code === "marketing_content_not_approvable"
      ));
    } finally {
      await db.close();
    }
  });

  it("enforces configured campaign content, video duration, and China-day publish limits", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "campaign-limits-project",
        sourceSnapshot: {}, name: "Campaign limits project",
      }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "campaign-limits-source");
      await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "campaign-limits-v1", capability: { video: true }, rules: {} }, adminId);
      const limitedCampaign = await marketing.createCampaign({
        projectId: project.id, name: "Generation limits", objective: "views",
        platformConstraints: { maxGeneratedContent: 1, maxVideoDurationSeconds: 10, maxDailyAgentRuns: 1 },
      }, adminId);
      const agentInput = {
        campaignId: limitedCampaign.id, dataClassification: "internal" as const,
        input: { knowledgeSegmentIds: [segmentId] }, idempotencyKey: `daily-agent-limit-${randomUUID()}`,
      };
      const firstAgentRun = await marketing.startAgentRun(agentInput, adminId);
      assert.equal(firstAgentRun.status, "queued");
      const repeatedAgentRun = await marketing.startAgentRun(agentInput, adminId);
      assert.deepEqual(repeatedAgentRun, { id: firstAgentRun.id, status: "queued", idempotent: true });
      await assert.rejects(() => marketing.startAgentRun({
        ...agentInput, idempotencyKey: `daily-agent-limit-second-${randomUUID()}`,
      }, adminId), (error: unknown) => error instanceof MarketingError
        && error.code === "marketing_campaign_daily_agent_run_limit_reached");
      const concurrentCampaign = await marketing.createCampaign({
        projectId: project.id, name: "Concurrent agent limit", objective: "views", platformConstraints: { maxDailyAgentRuns: 1 },
      }, adminId);
      const concurrentRuns = await Promise.allSettled(["first", "second"].map((suffix) => marketing.startAgentRun({
        campaignId: concurrentCampaign.id, dataClassification: "internal",
        input: { knowledgeSegmentIds: [segmentId] }, idempotencyKey: `concurrent-agent-${suffix}-${randomUUID()}`,
      }, adminId)));
      assert.equal(concurrentRuns.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(concurrentRuns.filter((result) => result.status === "rejected" && result.reason instanceof MarketingError
        && result.reason.code === "marketing_campaign_daily_agent_run_limit_reached").length, 1);
      const contentInput = {
        campaignId: limitedCampaign.id, platform: "douyin" as const, contentType: "video" as const, title: "Limited content",
        body: {}, knowledgeSegmentIds: [segmentId], trackingKey: `campaign-limits-${randomUUID()}`,
      };
      await assert.rejects(() => marketing.createContentVariant({
        ...contentInput,
        assetManifest: [{ type: "video", durationSeconds: 11, authorizationStatus: "owned" }],
      }, adminId), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_campaign_video_duration_limit_reached");
      await marketing.createContentVariant({
        ...contentInput,
        assetManifest: [{ type: "video", durationSeconds: 10, authorizationStatus: "owned" }],
      }, adminId);
      await assert.rejects(() => marketing.createContentVariant({
        ...contentInput, trackingKey: `campaign-limits-second-${randomUUID()}`,
        assetManifest: [{ type: "video", durationSeconds: 10, authorizationStatus: "owned" }],
      }, adminId), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_campaign_content_limit_reached");

      const storageObjectId = await seedStorageObject(db, userId, "campaign-limit-asset");
      const dailyCampaign = await marketing.createCampaign({
        projectId: project.id, name: "Daily limit", objective: "views", platformConstraints: { maxDailyPublishJobs: 1 },
      }, adminId);
      const dailyContent = await marketing.createContentVariant({
        campaignId: dailyCampaign.id, platform: "douyin", contentType: "video", title: "Daily content", body: {},
        knowledgeSegmentIds: [segmentId], assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
        trackingKey: `daily-limit-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(dailyContent.id, adminId);
      await marketing.approveContentVariant(dailyContent.id, adminId);
      const scheduledAt = "2026-08-16T02:00:00.000Z";
      const publishInput = {
        campaignId: dailyCampaign.id, contentVariantId: dailyContent.id, platform: "douyin", executorAccountRef: "daily-limit-account",
        scheduledAt, assets: [{ type: "video" as const, storageObjectId }],
      };
      await marketing.createPublishJob({ ...publishInput, idempotencyKey: `daily-limit-first-${randomUUID()}` }, adminId);
      await assert.rejects(() => marketing.createPublishJob({
        ...publishInput, idempotencyKey: `daily-limit-second-${randomUUID()}`,
        scheduledAt: "2026-08-16T03:00:00.000Z",
      }, adminId), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_campaign_daily_publish_limit_reached");
    } finally {
      await db.close();
    }
  });

  it("blocks manual approval when the latest compliance, citations, or reviewed assets are stale", async () => {
    const db = await createMigratedTestDb();
    try {
      const actors = await seedActors(db);
      const latestFixture = await seedManualReviewFixture(db, "manual-latest", actors);
      await db.query(
        `INSERT INTO marketing_compliance_checks (
           id, content_variant_id, platform_profile_id, status, risk_level,
           findings_json, rule_snapshot_json, reviewed_by_admin_id, reviewed_at, created_at
         ) VALUES ($1, $2, $3, 'passed', 'low', '[]'::jsonb, '{}'::jsonb, $4,
                   now() + interval '1 minute', now() + interval '1 minute')`,
        [randomUUID(), latestFixture.contentId, latestFixture.platformProfileId, latestFixture.adminId],
      );
      await assert.rejects(() => approveManualFixture(latestFixture, "latest"), (error: unknown) => (
        error instanceof Error && "code" in error && error.code === "marketing_manual_review_state_invalid"
      ));

      const citationFixture = await seedManualReviewFixture(db, "manual-citation", actors);
      await db.query(
        `UPDATE marketing_knowledge_documents AS document SET status = 'revoked', revoked_at = now()
         FROM marketing_knowledge_segments AS segment
         WHERE segment.id = $1 AND document.id = segment.document_id`,
        [citationFixture.segmentId],
      );
      await assert.rejects(() => approveManualFixture(citationFixture, "citation"), (error: unknown) => (
        error instanceof Error && "code" in error && error.code === "marketing_knowledge_segment_scope_invalid"
      ));

      const assetFixture = await seedManualReviewFixture(db, "manual-asset", actors);
      await db.query("UPDATE storage_objects SET status = 'deleted', deleted_at = now() WHERE id = $1", [assetFixture.storageObjectId]);
      await assert.rejects(() => approveManualFixture(assetFixture, "asset"), (error: unknown) => (
        error instanceof Error && "code" in error && error.code === "marketing_content_assets_unavailable"
      ));
    } finally {
      await db.close();
    }
  });

  it("accepts the admin manual-review HTTP contract and requires its idempotency header", async () => {
    const db = await createMigratedTestDb();
    try {
      const fixture = await seedManualReviewFixture(db, "manual-http");
      const body = JSON.stringify({
        decision: "reject",
        reviewDimensions: { facts: false, assetRights: true, disclosure: true, platformRules: true },
        notes: "The factual claim needs revision.",
      });
      const missingHeader = await routeMarketingHttpRequest({
        request: marketingRequest(body), pathname: `/api/marketing/content/${fixture.contentId}/manual-review`, search: "",
        db, env: {}, requireSuperAdmin: async () => ({ ok: true, adminAccountId: fixture.adminId }),
      });
      assert.equal(missingHeader?.status, 400);
      assert.equal(missingHeader?.body.error && (missingHeader.body.error as { code: string }).code, "marketing_manual_review_idempotency_required");

      const accepted = await routeMarketingHttpRequest({
        request: marketingRequest(body, "manual-review-http"), pathname: `/api/marketing/content/${fixture.contentId}/manual-review`, search: "",
        db, env: {}, requireSuperAdmin: async () => ({ ok: true, adminAccountId: fixture.adminId }),
      });
      assert.equal(accepted?.status, 200);
      const responseData = accepted?.body.data as { content: { status: string; decision: string } };
      assert.equal(responseData.content.status, "rejected");
      assert.equal(responseData.content.decision, "reject");
    } finally {
      await db.close();
    }
  });

  it("validates external and manual sources through their source adapters at the HTTP boundary", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId } = await seedActors(db);
      const auth = async () => ({ ok: true as const, adminAccountId: adminId });
      const invalidExternal = await routeMarketingHttpRequest({
        request: marketingRequest(JSON.stringify({
          name: "Unverified external project", sourceType: "external_api", sourceNamespace: "partner-api",
          sourceRecordId: "partner-1", sourceVersion: "v1", authorizationStatus: "unknown", sourceSnapshot: {},
        })),
        pathname: "/api/marketing/projects", search: "", db, env: {}, requireSuperAdmin: auth,
      });
      assert.equal(invalidExternal?.status, 400);
      assert.equal((invalidExternal?.body.error as { code: string }).code, "marketing_external_source_authorization_required");

      const projectResponse = await routeMarketingHttpRequest({
        request: marketingRequest(JSON.stringify({
          name: "Manual source project", sourceType: "manual", sourceNamespace: "manual",
          sourceRecordId: "manual-project-1", sourceVersion: "v1", authorizationStatus: "owned", sourceSnapshot: { fact: "verified" },
        })),
        pathname: "/api/marketing/projects", search: "", db, env: {}, requireSuperAdmin: auth,
      });
      assert.equal(projectResponse?.status, 201);
      const projectId = String((projectResponse?.body.data as { project: { id: string } }).project.id);

      const invalidManual = await routeMarketingHttpRequest({
        request: marketingRequest(JSON.stringify({
          sourceNamespace: "manual", sourceRecordId: "manual-source-1", sourceVersion: "v1",
          authorizationStatus: "unknown", sourceSnapshot: { fact: "unverified" },
        })),
        pathname: `/api/marketing/projects/${projectId}/sources`, search: "", db, env: {}, requireSuperAdmin: auth,
      });
      assert.equal(invalidManual?.status, 400);
      assert.equal((invalidManual?.body.error as { code: string }).code, "marketing_source_authorization_required");

      const validManual = await routeMarketingHttpRequest({
        request: marketingRequest(JSON.stringify({
          sourceNamespace: "manual", sourceRecordId: "manual-source-1", sourceVersion: "v1",
          authorizationStatus: "authorized", sourceSnapshot: { fact: "verified" },
        })),
        pathname: `/api/marketing/projects/${projectId}/sources`, search: "", db, env: {}, requireSuperAdmin: auth,
      });
      assert.equal(validManual?.status, 201);
    } finally {
      await db.close();
    }
  });

  it("keeps research briefs scoped, reviewable, and stale after a cited source is revoked", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "research-project",
        sourceSnapshot: {}, name: "Research project",
      }, adminId);
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Research campaign", objective: "views" }, adminId);
      const source = await marketing.addSource(project.id, {
        sourceNamespace: "manual-link", sourceRecordId: "research-source", sourceVersion: "v1",
        sourceSnapshot: { title: "Authorized research link" }, sourceUrl: "https://example.test/research",
        contentHash: "a".repeat(64), authorizationStatus: "owned",
      }, adminId);
      const created = await marketing.createResearchBrief({
        campaignId: campaign.id,
        brief: { summary: "Use the cited source only as untrusted research material.", conclusions: ["Audience values a concise hook."] },
        sourceIds: [source.id],
      }, adminId);
      assert.equal(created.status, "draft");
      const reviewed = await marketing.reviewResearchBrief({
        researchBriefId: created.id, decision: "approve", notes: "Facts and source scope were manually checked.",
      }, adminId);
      assert.equal(reviewed.status, "approved");
      await marketing.revokeSource(project.id, source.id, adminId);
      const stale = await db.query<{ status: string }>("SELECT status FROM marketing_research_briefs WHERE id = $1", [created.id]);
      assert.equal(stale.rows[0]?.status, "stale");

      const otherProject = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "other-research-project",
        sourceSnapshot: {}, name: "Other research project",
      }, adminId);
      const otherSource = await marketing.addSource(otherProject.id, {
        sourceNamespace: "manual-link", sourceRecordId: "other-research-source", sourceVersion: "v1",
        sourceSnapshot: {}, authorizationStatus: "owned",
      }, adminId);
      await assert.rejects(() => marketing.createResearchBrief({
        campaignId: campaign.id, brief: {}, sourceIds: [otherSource.id],
      }, adminId), (error: unknown) => error instanceof Error && "code" in error
        && error.code === "marketing_research_source_scope_invalid");
    } finally {
      await db.close();
    }
  });

  it("supersedes old source facts and prevents them from returning in knowledge search", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "source-version-project",
        sourceSnapshot: {}, name: "Source version project",
      }, adminId);
      const v1 = await marketing.addSource(project.id, {
        sourceNamespace: "manual", sourceRecordId: "versioned-fact", sourceVersion: "v1",
        sourceSnapshot: { fact: "legacy fact" }, authorizationStatus: "owned",
      }, adminId);
      const document = await marketing.createKnowledgeDocument({
        projectId: project.id, sourceId: v1.id, title: "Versioned fact", documentType: "project_fact",
        version: "v1", authorizationStatus: "owned", content: "The legacy claim is verified for this project.",
      }, adminId);
      await marketing.approveKnowledgeDocument(document.id, adminId);
      assert.equal((await marketing.searchKnowledge({ projectId: project.id, query: "legacy claim" })).length, 1);

      const v2 = await marketing.addSource(project.id, {
        sourceNamespace: "manual", sourceRecordId: "versioned-fact", sourceVersion: "v2",
        sourceSnapshot: { fact: "replacement fact" }, authorizationStatus: "owned",
      }, adminId);
      assert.notEqual(v1.id, v2.id);
      const state = await db.query<{ source_status: string; document_status: string }>(
        `SELECT source.status AS source_status, document.status AS document_status
         FROM marketing_sources AS source
         JOIN marketing_knowledge_documents AS document ON document.source_id = source.id
         WHERE source.id = $1`,
        [v1.id],
      );
      assert.deepEqual(state.rows[0], { source_status: "revoked", document_status: "revoked" });
      assert.deepEqual(await marketing.searchKnowledge({ projectId: project.id, query: "legacy claim" }), []);
    } finally {
      await db.close();
    }
  });

  it("rejects duplicate active sources by canonical HTTPS URL and content hash", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "dedupe-project",
        sourceSnapshot: {}, name: "Dedupe project",
      }, adminId);
      const source = {
        sourceNamespace: "authorized-link", sourceVersion: "v1", sourceSnapshot: {},
        sourceUrl: "https://example.test/reference", contentHash: "b".repeat(64), authorizationStatus: "owned",
      };
      await marketing.addSource(project.id, { ...source, sourceRecordId: "reference-a" }, adminId);
      await assert.rejects(
        () => marketing.addSource(project.id, { ...source, sourceRecordId: "reference-b" }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_source_duplicate",
      );
      await assert.rejects(
        () => marketing.addSource(project.id, { ...source, sourceRecordId: "invalid-url", sourceUrl: "http://example.test/reference", contentHash: null }, adminId),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_source_url_invalid",
      );
    } finally {
      await db.close();
    }
  });

  it("skips unsupported image jobs so a video-only executor can claim the next compatible job", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "capability-project",
        sourceSnapshot: {}, name: "Capability project",
      }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "capability-source");
      const storageObjectId = await seedStorageObject(db, userId, "capability-asset");
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "Capability campaign", objective: "views" }, adminId);
      await marketing.savePlatformCapabilityProfile({
        platform: "douyin", version: "capability-v1", capability: { video: true, imagePost: true }, rules: {},
      }, adminId);
      const image = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "image", title: "Image post", body: {},
        knowledgeSegmentIds: [segmentId], assetManifest: [{ type: "image", storageObjectId, authorizationStatus: "owned" }],
        trackingKey: `capability-image-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(image.id, adminId);
      await marketing.approveContentVariant(image.id, adminId);
      const video = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "Video post", body: {},
        knowledgeSegmentIds: [segmentId], assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
        trackingKey: `capability-video-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(video.id, adminId);
      await marketing.approveContentVariant(video.id, adminId);
      const now = new Date();
      const imageJob = await marketing.createPublishJob({
        campaignId: campaign.id, contentVariantId: image.id, platform: "douyin", executorAccountRef: "video-only",
        idempotencyKey: `capability-image-job-${randomUUID()}`, scheduledAt: now.toISOString(), assets: [{ type: "image", storageObjectId }],
      }, adminId);
      const videoJob = await marketing.createPublishJob({
        campaignId: campaign.id, contentVariantId: video.id, platform: "douyin", executorAccountRef: "video-only",
        idempotencyKey: `capability-video-job-${randomUUID()}`, scheduledAt: new Date(now.getTime() + 1_000).toISOString(), assets: [{ type: "video", storageObjectId }],
      }, adminId);
      await marketing.registerExecutor({
        workerId: "qianfan-video-only", version: "1.0.0",
        capabilities: {
          platforms: [{ platform: "douyin", accountRefs: ["video-only"] }],
          platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: false }],
        },
      });
      const claimed = await marketing.claimNext("qianfan-video-only", new Date(now.getTime() + 60_000));
      assert.equal(claimed?.jobId, videoJob.id);
      const imageStatus = await db.query<{ status: string }>("SELECT status FROM marketing_publish_jobs WHERE id = $1", [imageJob.id]);
      assert.equal(imageStatus.rows[0]?.status, "scheduled");
    } finally {
      await db.close();
    }
  });

  it("signs identical v1 canonical requests and rejects a nonce replay", async () => {
    const db = await createMigratedTestDb();
    try {
      const body = Buffer.from('{"version":"1.0.0"}');
      const timestamp = String(Date.now());
      const signed = signQianFanV1Request({
        secret: "test-secret", method: "POST", pathWithQuery: "/api/integrations/qianfan/capabilities",
        workerId: "qianfan-test", keyId: "test-key", timestamp, nonce: "11111111-1111-4111-8111-111111111111", body,
      });
      const request = {
        db,
        env: { MARKETING_QIANFAN_HMAC_KEYS_JSON: JSON.stringify({ "test-key": { workerId: "qianfan-test", secret: "test-secret" } }) },
        method: "POST", pathWithQuery: "/api/integrations/qianfan/capabilities", body,
        headers: {
          "x-marketing-version": "v1", "x-marketing-worker-id": "qianfan-test", "x-marketing-key-id": "test-key",
          "x-marketing-timestamp": timestamp, "x-marketing-nonce": "11111111-1111-4111-8111-111111111111",
          "x-marketing-content-sha256": signed.bodySha256, "x-marketing-signature": signed.signature,
        },
      };
      const accepted = await verifyQianFanHmac(request);
      assert.equal(accepted.workerId, "qianfan-test");
      assert.equal(accepted.keyId, "test-key");
      assert.match(accepted.keyFingerprint, /^[a-f0-9]{64}$/);
      await assert.rejects(() => verifyQianFanHmac(request), (error: unknown) => (
        error instanceof QianFanHmacError && error.code === "marketing_hmac_nonce_replayed"
      ));
    } finally {
      await db.close();
    }
  });

  it("rejects a signed request after its executor key retirement time", async () => {
    const db = await createMigratedTestDb();
    try {
      const { adminId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      const workerId = "retired-key-worker";
      const keyId = "retired-key";
      const secret = "retired-key-secret";
      const issuedAt = new Date("2030-01-01T00:00:00.000Z");
      const validUntil = new Date(issuedAt.getTime() + 60_000);
      await marketing.registerExecutor({ workerId, version: "1.0.0", capabilities: {}, keyId, keyFingerprint: "fingerprint-only" });
      await marketing.scheduleExecutorKeyRetirement({ workerId, keyId, validUntil: validUntil.toISOString() }, adminId);

      const body = Buffer.from('{"version":"1.0.0"}');
      const timestamp = String(issuedAt.getTime() + 120_000);
      const signed = signQianFanV1Request({
        secret, method: "POST", pathWithQuery: "/api/integrations/qianfan/capabilities",
        workerId, keyId, timestamp, nonce: "22222222-2222-4222-8222-222222222222", body,
      });
      await assert.rejects(
        () => verifyQianFanHmac({
          db,
          env: { MARKETING_QIANFAN_HMAC_KEYS_JSON: JSON.stringify({ [keyId]: { workerId, secret } }) },
          method: "POST", pathWithQuery: "/api/integrations/qianfan/capabilities", body,
          headers: {
            "x-marketing-version": "v1", "x-marketing-worker-id": workerId, "x-marketing-key-id": keyId,
            "x-marketing-timestamp": timestamp, "x-marketing-nonce": "22222222-2222-4222-8222-222222222222",
            "x-marketing-content-sha256": signed.bodySha256, "x-marketing-signature": signed.signature,
          },
          now: new Date(issuedAt.getTime() + 120_000),
        }),
        (error: unknown) => error instanceof QianFanHmacError && error.code === "marketing_hmac_key_retired",
      );
    } finally {
      await db.close();
    }
  });

  it("completes the signed QianFan HTTP publish lifecycle without duplicate results", async () => {
    const db = await createMigratedTestDb();
    const secret = "http-lifecycle-secret";
    const workerId = "qianfan-http-lifecycle";
    const storageAdapter = testStorageAdapter();
    const server = createPhoneAuthDevServer({
      db,
      storageRuntime: { adapter: storageAdapter },
      env: {
        MARKETING_QIANFAN_HMAC_KEYS_JSON: JSON.stringify({
          "http-lifecycle-key": { workerId, secret },
        }),
      },
    });
    try {
      const { adminId, userId } = await seedActors(db);
      const marketing = createMarketingService({ db, storageAdapter });
      const project = await marketing.createProject({
        ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "http-lifecycle-project",
        sourceSnapshot: {}, name: "HTTP lifecycle project",
      }, adminId);
      const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, "http-lifecycle-source");
      const storageObjectId = await seedStorageObject(db, userId, "http-lifecycle-asset");
      const campaign = await marketing.createCampaign({ projectId: project.id, name: "HTTP lifecycle campaign", objective: "views" }, adminId);
      await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "http-lifecycle-v1", capability: { video: true }, rules: {} }, adminId);
      const content = await marketing.createContentVariant({
        campaignId: campaign.id, platform: "douyin", contentType: "video", title: "Verified HTTP content",
        body: { description: "A verified lifecycle test." }, knowledgeSegmentIds: [segmentId],
        assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
        trackingKey: `http-lifecycle-${randomUUID()}`,
      }, adminId);
      await marketing.runComplianceCheck(content.id, adminId);
      await marketing.approveContentVariant(content.id, adminId);
      const publishJob = await marketing.createPublishJob({
        campaignId: campaign.id, contentVariantId: content.id, platform: "douyin", executorAccountRef: "douyin-http-account",
        idempotencyKey: `http-lifecycle-job-${randomUUID()}`, scheduledAt: new Date().toISOString(),
        assets: [{ type: "video", storageObjectId }],
      }, adminId);

      await server.listen(0);
      const capabilities = await signedExecutorPost(server.origin, "/api/integrations/qianfan/capabilities", {
        ...executorEnvelopeBody("available"), workerVersion: "1.0.0",
        platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: false }],
        accounts: [{ platform: "douyin", executorAccountRef: "douyin-http-account", status: "available" }],
        maxConcurrentPublishWorkers: 1, maxBrowserSessions: 1, freeDiskBytes: 40 * 1024 ** 3,
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(capabilities.response.status, 200, JSON.stringify(capabilities.payload));
      assert.equal(capabilities.payload.status, "registered");

      const next = await signedExecutorPost(server.origin, "/api/integrations/qianfan/publish-jobs/next", {
        ...executorEnvelopeBody("ready"), workerVersion: "1.0.0",
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(next.response.status, 200, JSON.stringify(next.payload));
      assert.equal(next.payload.status, "leased");
      assert.equal(next.payload.jobId, publishJob.id);
      const attemptId = String(next.payload.attemptId);
      assert.ok(attemptId);
      assert.equal((next.payload.assets as unknown[]).length, 1);

      const ack = await signedExecutorPost(server.origin, `/api/integrations/qianfan/publish-jobs/${publishJob.id}/ack`, {
        ...executorEnvelopeBody("downloaded"), attemptId,
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(ack.payload.status, "acknowledged");

      const running = await signedExecutorPost(server.origin, `/api/integrations/qianfan/publish-jobs/${publishJob.id}/events`, {
        ...executorEnvelopeBody("running"), attemptId,
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(running.payload.status, "accepted");

      const terminalEventId = randomUUID();
      const publishedAt = new Date().toISOString();
      const succeeded = await signedExecutorPost(server.origin, `/api/integrations/qianfan/publish-jobs/${publishJob.id}/events`, {
        schemaVersion: "v1", eventId: terminalEventId, occurredAt: publishedAt, idempotencyKey: `terminal-${terminalEventId}`,
        status: "succeeded", attemptId,
        publishResult: {
          platformContentId: "douyin-http-content", publishUrl: "https://www.douyin.com/video/http-lifecycle",
          publishedAt, status: "succeeded", failureCode: null, failureMessage: null, rawResultRef: null,
        },
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(succeeded.payload.status, "accepted");

      const duplicate = await signedExecutorPost(server.origin, `/api/integrations/qianfan/publish-jobs/${publishJob.id}/events`, {
        schemaVersion: "v1", eventId: terminalEventId, occurredAt: publishedAt, idempotencyKey: `terminal-${terminalEventId}`,
        status: "succeeded", attemptId,
        publishResult: {
          platformContentId: "douyin-http-content", publishUrl: "https://www.douyin.com/video/http-lifecycle",
          publishedAt, status: "succeeded", failureCode: null, failureMessage: null, rawResultRef: null,
        },
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(duplicate.payload.status, "duplicate");

      const analytics = await signedExecutorPost(server.origin, "/api/integrations/qianfan/analytics", {
        ...executorEnvelopeBody("observed"), jobId: publishJob.id, attemptId, metricName: "views", metricValue: 12,
        metricSource: "executor_observed", observedAt: new Date().toISOString(), observationWindow: { hours: 1 },
      }, { workerId, secret, keyId: "http-lifecycle-key" });
      assert.equal(analytics.payload.status, "accepted");

      const stored = await db.query<{ job_status: string; content_status: string; event_count: number; metric_count: number }>(
        `SELECT job.status AS job_status, content.status AS content_status,
                (SELECT count(*)::int FROM marketing_publish_events WHERE publish_job_id = job.id) AS event_count,
                (SELECT count(*)::int FROM marketing_metric_observations WHERE publish_job_id = job.id) AS metric_count
         FROM marketing_publish_jobs AS job
         JOIN marketing_content_variants AS content ON content.id = job.content_variant_id
         WHERE job.id = $1`,
        [publishJob.id],
      );
      assert.deepEqual(stored.rows[0], { job_status: "succeeded", content_status: "published", event_count: 2, metric_count: 1 });
      const consoleData = await marketing.listConsole();
      const consoleContent = consoleData.contentVariants.find((item) => item.id === content.id);
      assert.deepEqual(consoleContent?.knowledgeSegmentIds, [segmentId]);
      assert.deepEqual(consoleContent?.assetManifest, [{ type: "video", storageObjectId, authorizationStatus: "owned" }]);
      assert.deepEqual(consoleContent?.body, { description: "A verified lifecycle test." });
      assert.equal(consoleData.metricComparisons.length, 1);
      assert.equal(consoleData.metricComparisons[0]?.conclusion, "insufficient_sample");
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("accepts a signed executor capability heartbeat through the HTTP boundary", async () => {
    const db = await createMigratedTestDb();
    const secret = "test-secret";
    const server = createPhoneAuthDevServer({
      db,
      env: {
        MARKETING_QIANFAN_HMAC_KEYS_JSON: JSON.stringify({
          "test-key": { workerId: "qianfan-http", secret },
        }),
      },
    });
    try {
      await server.listen(0);
      const pathname = "/api/integrations/qianfan/capabilities";
      const eventId = randomUUID();
      const body = Buffer.from(JSON.stringify({
        schemaVersion: "v1", eventId, occurredAt: new Date().toISOString(), idempotencyKey: `capability-${eventId}`,
        status: "available", workerVersion: "1.0.0",
        platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: true }],
        accounts: [{ platform: "douyin", executorAccountRef: "douyin-account-1", status: "available" }],
        maxConcurrentPublishWorkers: 1, maxBrowserSessions: 1, freeDiskBytes: 1024,
      }));
      const timestamp = String(Date.now());
      const nonce = randomUUID();
      const signed = signQianFanV1Request({
        secret, method: "POST", pathWithQuery: pathname, workerId: "qianfan-http", keyId: "test-key", timestamp, nonce, body,
      });
      const response = await fetch(`${server.origin}${pathname}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-marketing-version": "v1", "x-marketing-worker-id": "qianfan-http", "x-marketing-key-id": "test-key",
          "x-marketing-timestamp": timestamp, "x-marketing-nonce": nonce,
          "x-marketing-content-sha256": signed.bodySha256, "x-marketing-signature": signed.signature,
        },
        body,
      });
      const payload = await response.json();
      assert.equal(response.status, 200, JSON.stringify(payload));
      assert.equal(payload.schemaVersion, "v1");
      assert.equal(payload.status, "registered");
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("blocks degraded and stale executors from claiming work while retaining health audit visibility", async () => {
    const db = await createMigratedTestDb();
    try {
      const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
      await marketing.registerExecutor({
        workerId: "qianfan-degraded", version: "1.0.0", status: "degraded",
        capabilities: {
          platforms: [], accounts: [{ platform: "douyin", executorAccountRef: "douyin-main", status: "needs_attention" }],
          platformCapabilities: [], freeDiskBytes: 29 * 1024 ** 3, healthReasons: ["insufficient_disk"],
        },
      });
      await assert.rejects(
        () => marketing.claimNext("qianfan-degraded"),
        (error: unknown) => error instanceof MarketingError && error.code === "marketing_executor_not_ready",
      );
      const degradedConsole = await marketing.listConsole();
      assert.deepEqual(degradedConsole.executorAlerts[0], {
        id: degradedConsole.executorAlerts[0]?.id,
        workerId: "qianfan-degraded", reason: "insufficient_disk", status: "open",
        detail: { workerId: "qianfan-degraded", status: "degraded", freeDiskBytes: 29 * 1024 ** 3 },
        detectedAt: degradedConsole.executorAlerts[0]?.detectedAt,
        lastSeenAt: degradedConsole.executorAlerts[0]?.lastSeenAt,
        resolvedAt: null,
      });
      await db.query(
        "UPDATE marketing_executors SET last_heartbeat_at = $2 WHERE worker_id = $1",
        ["qianfan-degraded", new Date(Date.now() - 6 * 60 * 1000)],
      );
      assert.deepEqual(await marketing.refreshExecutorHealth(), { offline: 1 });
      const executor = await db.query<{ status: string }>("SELECT status FROM marketing_executors WHERE worker_id = $1", ["qianfan-degraded"]);
      assert.equal(executor.rows[0]?.status, "offline");
      await marketing.registerExecutor({
        workerId: "qianfan-degraded", version: "1.0.1", status: "active",
        capabilities: { platforms: [], accounts: [], platformCapabilities: [], freeDiskBytes: 40 * 1024 ** 3, healthReasons: [] },
      });
      const recoveredConsole = await marketing.listConsole();
      assert.ok(recoveredConsole.executorAlerts.every((alert) => alert.status === "resolved"));
    } finally {
      await db.close();
    }
  });
});

type ManualReviewFixture = {
  marketing: ReturnType<typeof createMarketingService>;
  adminId: string;
  contentId: string;
  segmentId: string;
  storageObjectId: string;
  complianceCheckId: string;
  platformProfileId: string;
};

async function seedManualReviewFixture(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  suffix: string,
  actors?: { adminId: string; userId: string },
): Promise<ManualReviewFixture> {
  const { adminId, userId } = actors ?? await seedActors(db);
  const marketing = createMarketingService({ db, storageAdapter: testStorageAdapter() });
  const project = await marketing.createProject({
    ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: `project-${suffix}`,
    sourceSnapshot: { name: `Manual review ${suffix}` }, name: `Manual review ${suffix}`,
  }, adminId);
  const segmentId = await seedApprovedKnowledge(marketing, db, project.id, adminId, `source-${suffix}`);
  const storageObjectId = await seedStorageObject(db, userId, `asset-${suffix}`);
  const campaign = await marketing.createCampaign({ projectId: project.id, name: `Campaign ${suffix}`, objective: "views" }, adminId);
  const profile = await marketing.savePlatformCapabilityProfile({
    platform: `douyin-${suffix}`, version: "v1", capability: { video: true }, rules: {},
  }, adminId);
  const content = await marketing.createContentVariant({
    campaignId: campaign.id, platform: `douyin-${suffix}`, contentType: "video",
    title: "100% guaranteed result", body: { description: "Human review is required." },
    knowledgeSegmentIds: [segmentId],
    assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
    trackingKey: `manual-${suffix}-${randomUUID()}`,
  }, adminId);
  const compliance = await marketing.runComplianceCheck(content.id, adminId);
  assert.equal(compliance.status, "manual_review_required");
  return {
    marketing, adminId, contentId: content.id, segmentId, storageObjectId,
    complianceCheckId: compliance.id, platformProfileId: profile.id,
  };
}

function approveManualFixture(fixture: ManualReviewFixture, suffix: string) {
  return fixture.marketing.reviewContentVariant({
    contentVariantId: fixture.contentId,
    decision: "approve",
    reviewDimensions: { facts: true, assetRights: true, disclosure: true, platformRules: true },
    notes: "All required review dimensions were confirmed.",
    idempotencyKey: `manual-review-${suffix}`,
  }, fixture.adminId);
}

function marketingRequest(body: string, idempotencyKey?: string) {
  const request = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
  request.method = "POST";
  request.url = "/api/marketing/content/manual-review";
  request.headers = {
    "content-type": "application/json",
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
  return request;
}

function executorEnvelopeBody(status: string) {
  const eventId = randomUUID();
  return {
    schemaVersion: "v1",
    eventId,
    occurredAt: new Date().toISOString(),
    idempotencyKey: `${status}-${eventId}`,
    status,
  };
}

async function signedExecutorPost(
  origin: string,
  pathname: string,
  payload: Record<string, unknown>,
  credentials: { workerId: string; secret: string; keyId: string },
) {
  const body = Buffer.from(JSON.stringify(payload));
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signed = signQianFanV1Request({
    secret: credentials.secret, method: "POST", pathWithQuery: pathname,
    workerId: credentials.workerId, keyId: credentials.keyId, timestamp, nonce, body,
  });
  const response = await fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-marketing-version": "v1", "x-marketing-worker-id": credentials.workerId,
      "x-marketing-key-id": credentials.keyId, "x-marketing-timestamp": timestamp,
      "x-marketing-nonce": nonce, "x-marketing-content-sha256": signed.bodySha256,
      "x-marketing-signature": signed.signature,
    },
    body,
  });
  return { response, payload: await response.json() as Record<string, unknown> };
}

function testStorageAdapter(): StorageAdapter {
  return {
    async createSignedReadUrl(input) {
      return { url: `https://cos.example.test/${encodeURIComponent(input.objectKey)}`, expiresAt: input.expiresAt };
    },
    async copyObject() {
      return { eTag: "test-copy" };
    },
    async deleteObject() {},
  };
}

async function seedApprovedKnowledge(
  marketing: ReturnType<typeof createMarketingService>,
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  projectId: string,
  adminId: string,
  sourceRecordId: string,
) {
  const source = await marketing.addSource(projectId, {
    sourceNamespace: "manual", sourceRecordId, sourceVersion: "v1",
    sourceSnapshot: { fact: "verified" }, authorizationStatus: "owned",
  }, adminId);
  const document = await marketing.createKnowledgeDocument({
    projectId, sourceId: source.id, title: "Approved project fact", documentType: "project_fact",
    version: "v1", authorizationStatus: "owned", content: "This is a verified project fact for marketing content.",
    applicablePlatforms: ["douyin"], confidenceScore: 100,
  }, adminId);
  await marketing.approveKnowledgeDocument(document.id, adminId);
  const segment = await db.query<{ id: string }>(
    "SELECT id FROM marketing_knowledge_segments WHERE document_id = $1 ORDER BY sequence_number LIMIT 1",
    [document.id],
  );
  assert.ok(segment.rows[0]);
  return segment.rows[0].id;
}

async function seedStorageObject(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  userId: string,
  content: string,
) {
  const id = randomUUID();
  const checksum = createHash("sha256").update(content).digest("hex");
  await db.query(
    `INSERT INTO storage_objects (
       id, project_id, bucket, object_key, content_type, size_bytes, checksum,
       provider, status, metadata_json, created_by_user_id, created_at
     ) VALUES ($1, NULL, 'creator-test', $2, 'video/mp4', $3, $4, 'creator-dev', 'available', '{}'::jsonb, $5, now())`,
    [id, `marketing-tests/${id}.mp4`, Buffer.byteLength(content), checksum, userId],
  );
  return id;
}

async function seedActors(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const adminId = randomUUID();
  const userId = randomUUID();
  await db.query(
    "INSERT INTO users (id, phone_e164, display_name, password_hash, status, credit_balance_cached) VALUES ($1, '13800138000', 'Marketing Owner', 'plain:000000', 'active', 0)",
    [userId],
  );
  await db.query(
    "INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status, super_admin_slot) VALUES ($1, 'marketing_super_admin', 'plain:password', 'Marketing Admin', 'active', 1)",
    [adminId],
  );
  await db.query(
    "INSERT INTO admin_account_roles (id, admin_account_id, role_code) VALUES ($1, $2, 'super_admin')",
    [randomUUID(), adminId],
  );
  return { adminId, userId };
}
