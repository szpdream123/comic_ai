import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";

import { MarketingError, createMarketingService } from "../application/marketing.service.ts";
import { ComicMarketingSourceAdapter, SqlComicMarketingSourceReader } from "../adapters/comic-marketing-source.adapter.ts";
import { ExternalMarketingSourceAdapter } from "../adapters/external-marketing-source.adapter.ts";
import { ManualMarketingSourceAdapter } from "../adapters/manual-marketing-source.adapter.ts";
import { QianFanHmacError, verifyQianFanHmac } from "../infrastructure/qianfan-hmac.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import type { StorageAdapter } from "../../storage/storage.service.ts";

type HttpResponse = { status: number; body: Record<string, unknown> };
type AdminAuth = () => Promise<{ ok: true; adminAccountId: string } | { ok: false; response: HttpResponse }>;

export async function routeMarketingHttpRequest(input: {
  request: IncomingMessage;
  pathname: string;
  search: string;
  db: SqlDatabase;
  env: NodeJS.ProcessEnv;
  storageAdapter?: StorageAdapter;
  requireSuperAdmin: AdminAuth;
}): Promise<HttpResponse | undefined> {
  const { request, pathname } = input;
  const isAdminRoute = pathname.startsWith("/api/marketing/");
  const isExecutorRoute = pathname.startsWith("/api/integrations/qianfan/");
  if (!isAdminRoute && !isExecutorRoute) return undefined;
  const service = createMarketingService({ db: input.db, storageAdapter: input.storageAdapter });
  try {
    if (isAdminRoute) {
      const auth = await input.requireSuperAdmin();
      if (!auth.ok) return auth.response;
      return await adminRoute({ request, pathname, service, db: input.db, adminAccountId: auth.adminAccountId });
    }
    return await executorRoute({ request, pathname, search: input.search, service, db: input.db, env: input.env });
  } catch (error) {
    if (error instanceof MarketingError || error instanceof QianFanHmacError) {
      return { status: error.status, body: { error: { code: error.code, message: error.message } } };
    }
    if (error instanceof SyntaxError) {
      return { status: 400, body: { error: { code: "marketing_invalid_json", message: "Request body must be valid JSON" } } };
    }
    throw error;
  }
}

async function adminRoute(input: {
  request: IncomingMessage;
  pathname: string;
  service: ReturnType<typeof createMarketingService>;
  db: SqlDatabase;
  adminAccountId: string;
}): Promise<HttpResponse | undefined> {
  const { request, pathname, service, adminAccountId } = input;
  if (request.method === "GET" && pathname === "/api/marketing/console") {
    return data(200, await service.listConsole());
  }
  if (request.method === "GET" && pathname === "/api/marketing/direct-console") {
    return data(200, await service.listDirectConsole());
  }
  if (request.method === "GET" && pathname === "/api/marketing/generation-skills") {
    return data(200, { skills: await service.listGenerationSkillsForAdmin() });
  }
  if (request.method === "POST" && pathname === "/api/marketing/generation-skills") {
    const skill = await readGenerationSkillInput(request);
    return data(201, { skill: await service.saveGenerationSkill(skill, adminAccountId) });
  }
  const generationSkillMatch = pathname.match(/^\/api\/marketing\/generation-skills\/([^/]+)$/);
  if (request.method === "PATCH" && generationSkillMatch) {
    const skill = await readGenerationSkillInput(request);
    return data(200, { skill: await service.saveGenerationSkill(skill, adminAccountId, decodeURIComponent(generationSkillMatch[1])) });
  }
  if (request.method === "POST" && pathname === "/api/marketing/research-source-policies") {
    const body = objectBody(await readJson(request));
    const policy = await service.saveResearchSourcePolicy({
      domain: stringValue(body.domain), purpose: stringValue(body.purpose),
      maxRequestsPerHour: typeof body.maxRequestsPerHour === "number" ? body.maxRequestsPerHour : undefined,
      allowFullText: body.allowFullText === true,
      status: body.status === "active" || body.status === "disabled" ? body.status : undefined,
    }, adminAccountId);
    return data(201, { policy });
  }
  if (request.method === "POST" && pathname === "/api/marketing/component-admissions") {
    const body = objectBody(await readJson(request));
    const componentType = stringValue(body.componentType);
    if (!["model", "provider", "data_service", "open_source"].includes(componentType)) {
      return error(400, "marketing_component_type_invalid", "Component type is invalid");
    }
    const status = stringValue(body.status);
    if (status && !["draft", "approved", "rejected", "disabled"].includes(status)) {
      return error(400, "marketing_component_status_invalid", "Component status is invalid");
    }
    const component = await service.saveComponentAdmission({
      componentType: componentType as "model" | "provider" | "data_service" | "open_source",
      componentName: stringValue(body.componentName), componentVersion: stringValue(body.componentVersion),
      approvalReference: stringValue(body.approvalReference), licenseSummary: stringValue(body.licenseSummary),
      commercialUseTerms: stringValue(body.commercialUseTerms), dataProcessingLocation: stringValue(body.dataProcessingLocation),
      securitySummary: stringValue(body.securitySummary), upgradePlan: stringValue(body.upgradePlan), removalPlan: stringValue(body.removalPlan),
      status: status ? status as "draft" | "approved" | "rejected" | "disabled" : undefined,
    }, adminAccountId);
    return data(201, { component });
  }
  const executorKeyRetirementMatch = pathname.match(/^\/api\/marketing\/executors\/([^/]+)\/keys\/([^/]+)\/retire$/);
  if (request.method === "POST" && executorKeyRetirementMatch) {
    const body = objectBody(await readJson(request));
    const key = await service.scheduleExecutorKeyRetirement({
      workerId: decodeURIComponent(executorKeyRetirementMatch[1]), keyId: decodeURIComponent(executorKeyRetirementMatch[2]),
      validUntil: stringValue(body.validUntil),
    }, adminAccountId);
    return data(200, { key });
  }
  if (request.method === "POST" && pathname === "/api/marketing/agent-provider-approvals") {
    const body = objectBody(await readJson(request));
    const stage = stringValue(body.stage);
    if (stage !== "strategy" && stage !== "copy" && stage !== "compliance") {
      return error(400, "marketing_agent_provider_stage_invalid", "Provider stage is invalid");
    }
    const status = stringValue(body.status);
    if (status && status !== "draft" && status !== "approved" && status !== "disabled") {
      return error(400, "marketing_agent_provider_status_invalid", "Provider status is invalid");
    }
    const approval = await service.saveAgentProviderApproval({
      providerName: stringValue(body.providerName), modelCode: stringValue(body.modelCode), stage,
      approvalReference: stringValue(body.approvalReference), dataClassifications: stringArray(body.dataClassifications),
      allowedInputPaths: stringArray(body.allowedInputPaths),
      status: status ? status as "draft" | "approved" | "disabled" : undefined,
    }, adminAccountId);
    return data(201, { approval });
  }
  const attentionAssignMatch = pathname.match(/^\/api\/marketing\/attention-cases\/([^/]+)\/assign$/);
  if (request.method === "POST" && attentionAssignMatch) {
    const body = objectBody(await readJson(request));
    const attentionCase = await service.assignAttentionCase(
      decodeURIComponent(attentionAssignMatch[1]), stringValue(body.ownerAdminId), stringValue(body.dueAt), adminAccountId,
    );
    return data(200, { attentionCase });
  }
  const attentionResolveMatch = pathname.match(/^\/api\/marketing\/attention-cases\/([^/]+)\/resolve$/);
  if (request.method === "POST" && attentionResolveMatch) {
    const body = objectBody(await readJson(request));
    const attentionCase = await service.resolveAttentionCase(
      decodeURIComponent(attentionResolveMatch[1]), stringValue(body.resolution), adminAccountId,
    );
    return data(200, { attentionCase });
  }
  if (request.method === "POST" && pathname === "/api/marketing/platform-profiles") {
    const body = objectBody(await readJson(request));
    const profile = await service.savePlatformCapabilityProfile({
      platform: stringValue(body.platform), version: stringValue(body.version),
      capability: jsonValue(body.capability, {}), rules: jsonValue(body.rules, {}),
    }, adminAccountId);
    return data(201, { profile });
  }
  if (request.method === "POST" && pathname === "/api/marketing/knowledge-documents") {
    const body = objectBody(await readJson(request));
    const document = await service.createKnowledgeDocument({
      projectId: stringOrNull(body.projectId), sourceId: stringOrNull(body.sourceId), title: stringValue(body.title),
      documentType: stringValue(body.documentType), version: stringValue(body.version), authorizationStatus: stringValue(body.authorizationStatus),
      content: stringValue(body.content), applicablePlatforms: stringArray(body.applicablePlatforms),
      confidenceScore: typeof body.confidenceScore === "number" ? body.confidenceScore : undefined,
    }, adminAccountId);
    return data(201, { document });
  }
  if (request.method === "POST" && pathname === "/api/marketing/competitor-collection-jobs") {
    const body = objectBody(await readJson(request));
    const collectionMode = stringValue(body.collectionMode);
    if (collectionMode !== "keyword" && collectionMode !== "creator") {
      return error(400, "marketing_competitor_collection_mode_invalid", "Collection mode must be keyword or creator");
    }
    const job = await service.createCompetitorCollectionJob({
      projectId: stringValue(body.projectId), campaignId: stringOrNull(body.campaignId), name: stringValue(body.name),
      collectionMode, queryText: stringValue(body.queryText), crawlerBaseUrl: stringValue(body.crawlerBaseUrl),
      maxItems: typeof body.maxItems === "number" ? body.maxItems : undefined,
      includeComments: typeof body.includeComments === "boolean" ? body.includeComments : undefined,
      intervalMinutes: typeof body.intervalMinutes === "number" ? body.intervalMinutes : undefined,
    }, adminAccountId);
    return data(201, { job });
  }
  const competitorCollectionJobMatch = pathname.match(/^\/api\/marketing\/competitor-collection-jobs\/([^/]+)$/);
  if (request.method === "PATCH" && competitorCollectionJobMatch) {
    const body = objectBody(await readJson(request));
    const collectionMode = stringValue(body.collectionMode);
    const status = stringValue(body.status);
    if (collectionMode !== "keyword" && collectionMode !== "creator") {
      return error(400, "marketing_competitor_collection_mode_invalid", "Collection mode must be keyword or creator");
    }
    if (status !== "active" && status !== "paused" && status !== "disabled") {
      return error(400, "marketing_competitor_collection_status_invalid", "Collection status is invalid");
    }
    const job = await service.updateCompetitorCollectionJob(decodeURIComponent(competitorCollectionJobMatch[1]), {
      projectId: stringValue(body.projectId), campaignId: stringOrNull(body.campaignId), name: stringValue(body.name),
      collectionMode, queryText: stringValue(body.queryText), crawlerBaseUrl: stringValue(body.crawlerBaseUrl),
      maxItems: typeof body.maxItems === "number" ? body.maxItems : undefined,
      includeComments: typeof body.includeComments === "boolean" ? body.includeComments : undefined,
      intervalMinutes: typeof body.intervalMinutes === "number" ? body.intervalMinutes : undefined,
      status,
    }, adminAccountId);
    return data(200, { job });
  }
  if (request.method === "GET" && pathname === "/api/marketing/competitor-collection-jobs") {
    const query = new URLSearchParams((request.url ?? "").split("?")[1] ?? "");
    return data(200, { jobs: await service.listCompetitorCollectionJobs(query.get("projectId") ?? "") });
  }
  const knowledgeApproveMatch = pathname.match(/^\/api\/marketing\/knowledge-documents\/([^/]+)\/approve$/);
  if (request.method === "POST" && knowledgeApproveMatch) {
    const document = await service.approveKnowledgeDocument(decodeURIComponent(knowledgeApproveMatch[1]), adminAccountId);
    return data(200, { document });
  }
  if (request.method === "GET" && pathname === "/api/marketing/knowledge/search") {
    const query = new URLSearchParams((request.url ?? "").split("?")[1] ?? "");
    const segments = await service.searchKnowledge({
      projectId: query.get("projectId"), platform: query.get("platform"), query: query.get("q") ?? "", limit: Number(query.get("limit") ?? 8),
    });
    return data(200, { segments });
  }
  if (request.method === "POST" && pathname === "/api/marketing/trend-patterns") {
    const body = objectBody(await readJson(request));
    const pattern = await service.createTrendPattern({
      projectId: stringOrNull(body.projectId), sourceId: stringValue(body.sourceId), title: stringValue(body.title),
      platform: stringValue(body.platform), pattern: jsonValue(body.pattern, {}),
    }, adminAccountId);
    return data(201, { pattern });
  }
  const trendApproveMatch = pathname.match(/^\/api\/marketing\/trend-patterns\/([^/]+)\/approve$/);
  if (request.method === "POST" && trendApproveMatch) {
    const pattern = await service.approveTrendPattern(decodeURIComponent(trendApproveMatch[1]), adminAccountId);
    return data(200, { pattern });
  }
  if (request.method === "POST" && pathname === "/api/marketing/agent-runs") {
    const body = objectBody(await readJson(request));
    const classification = stringValue(body.dataClassification);
    if (classification !== "public" && classification !== "internal" && classification !== "restricted") {
      return error(400, "marketing_agent_classification_invalid", "Data classification is invalid");
    }
    const run = await service.startAgentRun({
      campaignId: stringValue(body.campaignId), idempotencyKey: stringValue(body.idempotencyKey), dataClassification: classification,
      input: jsonValue(body.input, {}),
    }, adminAccountId);
    return data(201, { run });
  }
  const agentRetryMatch = pathname.match(/^\/api\/marketing\/agent-runs\/([^/]+)\/retry$/);
  if (request.method === "POST" && agentRetryMatch) {
    const run = await service.retryAgentRun(decodeURIComponent(agentRetryMatch[1]), adminAccountId);
    return data(200, { run });
  }
  if (request.method === "POST" && pathname === "/api/marketing/metrics") {
    const body = objectBody(await readJson(request));
    const metricSource = stringValue(body.metricSource);
    if (!["platform_api", "manual", "executor_observed", "unavailable"].includes(metricSource)) {
      return error(400, "marketing_metric_source_invalid", "Metric source is invalid");
    }
    const metric = await service.recordMetric({
      publishJobId: stringValue(body.publishJobId), eventId: stringOrNull(body.eventId), metricName: stringValue(body.metricName),
      metricValue: typeof body.metricValue === "number" ? body.metricValue : null,
      metricSource: metricSource as "platform_api" | "manual" | "executor_observed" | "unavailable",
      observedAt: stringValue(body.observedAt), observationWindow: jsonValue(body.observationWindow, {}),
    }, adminAccountId);
    return data(201, { metric });
  }
  const brandProfilesMatch = pathname.match(/^\/api\/marketing\/projects\/([^/]+)\/brand-profiles$/);
  if (brandProfilesMatch) {
    const projectId = decodeURIComponent(brandProfilesMatch[1]);
    if (request.method === "GET") {
      return data(200, { brandProfiles: await service.listBrandProfiles(projectId) });
    }
    if (request.method === "POST") {
      const body = objectBody(await readJson(request));
      const brandProfile = await service.createBrandProfileVersion({
        projectId, version: stringValue(body.version), profile: jsonValue(body.profile, {}),
      }, adminAccountId);
      return data(201, { brandProfile });
    }
  }
  const brandProfileActivateMatch = pathname.match(/^\/api\/marketing\/brand-profiles\/([^/]+)\/activate$/);
  if (request.method === "POST" && brandProfileActivateMatch) {
    const brandProfile = await service.activateBrandProfile(decodeURIComponent(brandProfileActivateMatch[1]), adminAccountId);
    return data(200, { brandProfile });
  }
  const brandProfileRevokeMatch = pathname.match(/^\/api\/marketing\/brand-profiles\/([^/]+)\/revoke$/);
  if (request.method === "POST" && brandProfileRevokeMatch) {
    const brandProfile = await service.revokeBrandProfile(decodeURIComponent(brandProfileRevokeMatch[1]), adminAccountId);
    return data(200, { brandProfile });
  }
  if (request.method === "POST" && pathname === "/api/marketing/projects") {
    const body = objectBody(await readJson(request));
    const source = await normalizeProjectSource(body);
    const created = await service.createProject({
      ownerUserId: stringOrNull(body.ownerUserId),
      sourceType: stringValue(body.sourceType), sourceNamespace: source.namespace,
      sourceRecordId: source.recordId, sourceSnapshot: source.snapshot,
      name: stringValue(body.name), brandProfile: jsonValue(body.brandProfile, {}),
    }, adminAccountId);
    return data(201, { project: created });
  }
  if (request.method === "POST" && pathname === "/api/marketing/execution-owner") {
    const body = objectBody(await readJson(request));
    const executionOwner = await service.configureExecutionOwner(stringValue(body.ownerUserId), adminAccountId);
    return data(200, { executionOwner });
  }
  if (request.method === "POST" && pathname === "/api/marketing/projects/from-comic") {
    const body = objectBody(await readJson(request));
    let manifest;
    try {
      manifest = await new ComicMarketingSourceAdapter(new SqlComicMarketingSourceReader(input.db)).toManifest({
        projectId: stringValue(body.projectId), version: stringValue(body.version),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "marketing_comic_project_not_found") {
        throw new MarketingError(404, "marketing_comic_project_not_found", "Comic project was not found");
      }
      throw new MarketingError(400, "marketing_comic_source_invalid", "Comic marketing source request is invalid");
    }
    const snapshot = objectBody(manifest.snapshot);
    const comicProject = objectBody(snapshot.project);
    const created = await service.createProject({
      ownerUserId: stringOrNull(comicProject.ownerUserId),
      sourceType: "comic_internal", sourceNamespace: manifest.namespace, sourceRecordId: manifest.recordId,
      sourceSnapshot: manifest.snapshot, name: stringValue(comicProject.name), brandProfile: jsonValue(snapshot.brandProfile, {}),
    }, adminAccountId, { allowComicInternal: true });
    return data(201, { project: created, sourceVersion: manifest.version });
  }
  const sourceMatch = pathname.match(/^\/api\/marketing\/projects\/([^/]+)\/sources$/);
  if (request.method === "POST" && sourceMatch) {
    const body = objectBody(await readJson(request));
    const sourceInput = await normalizeMarketingSource(body);
    const source = await service.addSource(decodeURIComponent(sourceMatch[1]), {
      sourceNamespace: sourceInput.namespace, sourceRecordId: sourceInput.recordId,
      sourceVersion: sourceInput.version, sourceSnapshot: sourceInput.snapshot,
      sourceUrl: sourceInput.sourceUrl ?? null, contentHash: sourceInput.contentHash ?? null,
      authorizationStatus: sourceInput.authorizationStatus,
    }, adminAccountId);
    return data(201, { source });
  }
  const sourceItemMatch = pathname.match(/^\/api\/marketing\/projects\/([^/]+)\/sources\/([^/]+)$/);
  if (request.method === "PATCH" && sourceItemMatch) {
    const body = objectBody(await readJson(request));
    if (body.status !== "revoked") return error(400, "marketing_source_patch_invalid", "Only source revocation is supported in MVP");
    const source = await service.revokeSource(decodeURIComponent(sourceItemMatch[1]), decodeURIComponent(sourceItemMatch[2]), adminAccountId);
    return data(200, { source });
  }
  if (request.method === "POST" && pathname === "/api/marketing/campaigns") {
    const body = objectBody(await readJson(request));
    const campaign = await service.createCampaign({
      projectId: stringValue(body.projectId), name: stringValue(body.name), objective: stringValue(body.objective),
      brandProfileId: stringOrNull(body.brandProfileId),
      audience: jsonValue(body.audience, {}), platformConstraints: jsonValue(body.platformConstraints, {}),
      prohibitedExpressions: stringArray(body.prohibitedExpressions), scheduleWindow: jsonValue(body.scheduleWindow, {}),
    }, adminAccountId);
    return data(201, { campaign });
  }
  const campaignResearchMatch = pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/research$/);
  if (request.method === "POST" && campaignResearchMatch) {
    const body = objectBody(await readJson(request));
    const researchBrief = await service.createResearchBrief({
      campaignId: decodeURIComponent(campaignResearchMatch[1]),
      brief: jsonValue(body.brief, {}),
      sourceIds: stringArray(body.sourceIds),
    }, adminAccountId);
    return data(201, { researchBrief });
  }
  const researchReviewMatch = pathname.match(/^\/api\/marketing\/research-briefs\/([^/]+)\/review$/);
  if (request.method === "POST" && researchReviewMatch) {
    const body = objectBody(await readJson(request));
    const researchBrief = await service.reviewResearchBrief({
      researchBriefId: decodeURIComponent(researchReviewMatch[1]),
      decision: stringValue(body.decision) as "approve" | "reject",
      notes: stringValue(body.notes),
    }, adminAccountId);
    return data(200, { researchBrief });
  }
  const campaignContentMatch = pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/content$/);
  if (request.method === "POST" && campaignContentMatch) {
    const body = objectBody(await readJson(request));
    const content = await service.createContentVariant({
      campaignId: decodeURIComponent(campaignContentMatch[1]), platform: stringValue(body.platform),
      contentType: stringValue(body.contentType) as "image" | "video", title: stringValue(body.title),
      body: jsonValue(body.body, {}), assetManifest: jsonValue(body.assetManifest, []),
      knowledgeSegmentIds: stringArray(body.knowledgeSegmentIds), complianceReport: jsonValue(body.complianceReport, {}),
      trackingKey: stringValue(body.trackingKey),
    }, adminAccountId);
    return data(201, { content });
  }
  const approveMatch = pathname.match(/^\/api\/marketing\/content\/([^/]+)\/approve$/);
  if (request.method === "POST" && approveMatch) {
    const content = await service.approveContentVariant(decodeURIComponent(approveMatch[1]), adminAccountId);
    return data(200, { content });
  }
  const complianceMatch = pathname.match(/^\/api\/marketing\/content\/([^/]+)\/compliance$/);
  if (request.method === "POST" && complianceMatch) {
    const compliance = await service.runComplianceCheck(decodeURIComponent(complianceMatch[1]), adminAccountId);
    return data(200, { compliance });
  }
  const manualReviewMatch = pathname.match(/^\/api\/marketing\/content\/([^/]+)\/manual-review$/);
  if (request.method === "POST" && manualReviewMatch) {
    const body = objectBody(await readJson(request));
    const decision = stringValue(body.decision);
    const content = await service.reviewContentVariant({
      contentVariantId: decodeURIComponent(manualReviewMatch[1]),
      decision: decision as "approve" | "reject",
      reviewDimensions: manualReviewDimensions(body.reviewDimensions),
      notes: stringValue(body.notes),
      idempotencyKey: headerString(request.headers["idempotency-key"]),
    }, adminAccountId);
    return data(200, { content });
  }
  if (request.method === "POST" && pathname === "/api/marketing/publish-jobs") {
    const body = objectBody(await readJson(request));
    const publishJob = await service.createPublishJob({
      campaignId: stringValue(body.campaignId), contentVariantId: stringValue(body.contentVariantId),
      platform: stringValue(body.platform), executorAccountRef: stringValue(body.executorAccountRef),
      idempotencyKey: stringValue(body.idempotencyKey), scheduledAt: stringValue(body.scheduledAt),
      executeDeadline: stringOrUndefined(body.executeDeadline), assets: assetArray(body.assets),
    }, adminAccountId);
    return data(201, { publishJob });
  }
  if (request.method === "POST" && pathname === "/api/marketing/direct-publish") {
    const body = objectBody(await readJson(request));
    const contentType = stringValue(body.contentType);
    if (contentType !== "image" && contentType !== "video") {
      return error(400, "marketing_direct_publish_content_type_invalid", "Content type must be image or video");
    }
    const directPublish = await service.createDirectPublish({
      projectId: stringValue(body.projectId), direction: stringValue(body.direction),
      sourceFacts: stringValue(body.sourceFacts),
      modelCode: stringValue(body.modelCode),
      marketingSkillId: stringValue(body.marketingSkillId),
      skillId: stringValue(body.skillId),
      contentType, platform: stringValue(body.platform), executorAccountRef: stringValue(body.executorAccountRef),
      idempotencyKey: stringValue(body.idempotencyKey), scheduledAt: stringValue(body.scheduledAt),
    }, adminAccountId);
    return data(201, { directPublish });
  }
  const confirmPlanMatch = pathname.match(/^\/api\/marketing\/generation-runs\/([^/]+)\/confirm-plan$/);
  if (request.method === "POST" && confirmPlanMatch) {
    const generationRun = await service.confirmGenerationPlan(decodeURIComponent(confirmPlanMatch[1]), adminAccountId);
    return data(200, { generationRun });
  }
  const regenerateMatch = pathname.match(/^\/api\/marketing\/generation-runs\/([^/]+)\/regenerate$/);
  if (request.method === "POST" && regenerateMatch) {
    const body = objectBody(await readJson(request));
    const stage = stringValue(body.stage);
    if (stage !== "plan" && stage !== "media") {
      return error(400, "marketing_regeneration_stage_invalid", "Regeneration stage must be plan or media");
    }
    const generationRun = await service.regenerateGenerationRun(decodeURIComponent(regenerateMatch[1]), stage, adminAccountId);
    return data(200, { generationRun });
  }
  const confirmMediaMatch = pathname.match(/^\/api\/marketing\/generation-runs\/([^/]+)\/confirm-media$/);
  if (request.method === "POST" && confirmMediaMatch) {
    const generationRun = await service.confirmGeneratedMedia(decodeURIComponent(confirmMediaMatch[1]), adminAccountId);
    return data(200, { generationRun });
  }
  const cancelGenerationMatch = pathname.match(/^\/api\/marketing\/generation-runs\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelGenerationMatch) {
    const body = objectBody(await readJson(request));
    const generationRun = await service.cancelGenerationRun(
      decodeURIComponent(cancelGenerationMatch[1]), adminAccountId, stringValue(body.reason),
    );
    return data(200, { generationRun });
  }
  const retryGenerationMatch = pathname.match(/^\/api\/marketing\/generation-runs\/([^/]+)\/retry$/);
  if (request.method === "POST" && retryGenerationMatch) {
    const generationRun = await service.retryGenerationRun(decodeURIComponent(retryGenerationMatch[1]), adminAccountId);
    return data(200, { generationRun });
  }
  const cancelMatch = pathname.match(/^\/api\/marketing\/publish-jobs\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelMatch) {
    const body = objectBody(await readJson(request));
    const publishJob = await service.cancelPublishJob(decodeURIComponent(cancelMatch[1]), adminAccountId, stringValue(body.reason));
    return data(200, { publishJob });
  }
  return undefined;
}

async function executorRoute(input: {
  request: IncomingMessage;
  pathname: string;
  search: string;
  service: ReturnType<typeof createMarketingService>;
  db: SqlDatabase;
  env: NodeJS.ProcessEnv;
}): Promise<HttpResponse | undefined> {
  const { request, pathname, search, service } = input;
  const raw = await readRawBody(request);
  const verified = await verifyQianFanHmac({
    db: input.db, env: input.env, method: request.method ?? "GET", pathWithQuery: `${pathname}${search}`,
    headers: request.headers, body: raw,
  });
  const body = raw.length
    ? objectBody(JSON.parse(raw.toString("utf8")))
    : request.method === "GET"
      ? Object.fromEntries(new URLSearchParams(input.search))
      : {};
  const envelope = requireExecutorEnvelope(body);
  if (request.method === "POST" && pathname === "/api/integrations/qianfan/capabilities") {
    const accounts = recordArray(body.accounts);
    const executorStatus = stringValue(body.executorStatus) || "active";
    if (executorStatus !== "active" && executorStatus !== "degraded") {
      throw new MarketingError(400, "marketing_executor_status_invalid", "Executor status is invalid");
    }
    const executor = await service.registerExecutor({
      workerId: verified.workerId, version: stringValue(body.workerVersion), status: executorStatus, capabilities: {
        platforms: accounts
          .filter((account) => account.status === "available")
          .map((account) => ({ platform: stringValue(account.platform), accountRefs: [stringValue(account.executorAccountRef)] })),
        accounts: accounts.map((account) => ({
          platform: stringValue(account.platform), executorAccountRef: stringValue(account.executorAccountRef),
          accountName: stringValue(account.accountName), status: stringValue(account.status),
        })),
        platformCapabilities: jsonValue(body.platformCapabilities, []),
        maxConcurrentPublishWorkers: body.maxConcurrentPublishWorkers,
        maxBrowserSessions: body.maxBrowserSessions,
        freeDiskBytes: body.freeDiskBytes,
        healthReasons: stringArray(body.healthReasons),
      },
      keyId: verified.keyId, keyFingerprint: verified.keyFingerprint,
    });
    return executorEnvelope(envelope, { status: "registered", workerId: verified.workerId });
  }
  if (request.method === "POST" && pathname === "/api/integrations/qianfan/publish-jobs/next") {
    const job = await service.claimNext(verified.workerId);
    if (!job) return executorEnvelope(envelope, { status: "no_task", jobId: null, attemptId: null });
    const contentBody = objectBody(job.content.body);
    return executorEnvelope(envelope, {
      status: "leased", jobId: job.jobId, attemptId: job.attemptId, leaseExpiresAt: job.leaseUntil,
      platform: job.platform, executorAccountRef: job.executorAccountRef, scheduledAt: job.scheduledAt,
      notBefore: job.notBefore, executeDeadline: job.executeDeadline,
      content: {
        title: job.content.title,
        description: stringValue(contentBody.description),
        tags: stringArray(contentBody.tags),
        disclosures: stringArray(contentBody.disclosures),
      },
      assets: job.assets,
    });
  }
  const ackMatch = pathname.match(/^\/api\/integrations\/qianfan\/publish-jobs\/([^/]+)\/ack$/);
  if (request.method === "POST" && ackMatch) {
    const delivery = await service.acknowledge(verified.workerId, decodeURIComponent(ackMatch[1]), stringValue(body.attemptId));
    return executorEnvelope(envelope, { status: "acknowledged", jobId: delivery.jobId, attemptId: delivery.attemptId });
  }
  const heartbeatMatch = pathname.match(/^\/api\/integrations\/qianfan\/publish-jobs\/([^/]+)\/heartbeat$/);
  if (request.method === "POST" && heartbeatMatch) {
    const delivery = await service.heartbeat(verified.workerId, decodeURIComponent(heartbeatMatch[1]), stringValue(body.attemptId));
    return executorEnvelope(envelope, { status: "accepted", jobId: delivery.jobId, attemptId: delivery.attemptId, leaseExpiresAt: delivery.leaseUntil });
  }
  const eventMatch = pathname.match(/^\/api\/integrations\/qianfan\/publish-jobs\/([^/]+)\/events$/);
  if (request.method === "POST" && eventMatch) {
    const publishResult = objectBody(body.publishResult);
    const event = await service.reportEvent(verified.workerId, decodeURIComponent(eventMatch[1]), {
      attemptId: stringValue(body.attemptId), eventId: stringValue(body.eventId), status: stringValue(body.status),
      occurredAt: stringValue(body.occurredAt), platformContentId: stringOrNull(publishResult.platformContentId),
      publishUrl: stringOrNull(publishResult.publishUrl), publishedAt: stringOrNull(publishResult.publishedAt),
      failureCode: stringOrNull(publishResult.failureCode), failureMessage: stringOrNull(publishResult.failureMessage), rawResultRef: stringOrNull(publishResult.rawResultRef),
    });
    return executorEnvelope(envelope, { status: event.idempotent ? "duplicate" : "accepted", jobId: event.jobId, attemptId: event.attemptId });
  }
  const cancelStateMatch = pathname.match(/^\/api\/integrations\/qianfan\/publish-jobs\/([^/]+)\/cancel-state$/);
  if (request.method === "GET" && cancelStateMatch) {
    const attemptId = stringValue(body.attemptId) || new URLSearchParams(input.search).get("attemptId") || "";
    const state = await service.cancelState(verified.workerId, decodeURIComponent(cancelStateMatch[1]), attemptId);
    return executorEnvelope(envelope, {
      status: state.canceled ? "canceled" : state.status === "result_unknown" ? "result_unknown" : "active",
      jobId: state.jobId, attemptId, canceled: state.canceled, reason: null,
    });
  }
  if (request.method === "POST" && pathname === "/api/integrations/qianfan/analytics") {
    const metricSource = stringValue(body.metricSource);
    if (metricSource !== "platform_api" && metricSource !== "executor_observed" && metricSource !== "unavailable") {
      throw new MarketingError(400, "marketing_metric_source_invalid", "Executor metric source is invalid");
    }
    const metric = await service.recordMetric({
      publishJobId: stringValue(body.jobId), eventId: envelope.eventId, metricName: stringValue(body.metricName),
      metricValue: typeof body.metricValue === "number" ? body.metricValue : null,
      metricSource, observedAt: stringValue(body.observedAt), observationWindow: jsonValue(body.observationWindow, {}),
    });
    return executorEnvelope(envelope, { status: metric.idempotent ? "duplicate" : "accepted", jobId: stringValue(body.jobId), attemptId: stringValue(body.attemptId) });
  }
  return undefined;
}

async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 1024 * 1024) throw new MarketingError(400, "marketing_request_body_too_large", "Marketing request body exceeds one megabyte");
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage) {
  const raw = await readRawBody(request);
  return raw.length ? JSON.parse(raw.toString("utf8")) : {};
}

async function readGenerationSkillInput(request: IncomingMessage): Promise<any> {
  const contentType = String(request.headers["content-type"] ?? "");
  const raw = await readRawBody(request);
  if (!contentType.toLowerCase().includes("multipart/form-data")) return objectBody(raw.length ? JSON.parse(raw.toString("utf8")) : {});
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2];
  if (!boundary) throw new MarketingError(400, "marketing_skill_upload_invalid", "Multipart boundary is missing");
  const fields: Record<string, string> = {};
  for (const part of raw.toString("binary").split(`--${boundary}`)) {
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    const body = part.slice(separator + 4).replace(/\r\n--?$/, "");
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    if (!name) continue;
    const fileName = /filename="([^"]*)"/i.exec(headers)?.[1];
    fields[name] = fileName ? Buffer.from(body, "binary").toString("utf8") : body;
    if (fileName) {
      fields.sourceName ||= fileName;
      fields.uploadedFileName = fileName;
      fields.contentSha256 = createHash("sha256").update(Buffer.from(body, "binary")).digest("hex");
    }
  }
  if (!fields.planningInstruction && fields.file) fields.planningInstruction = fields.file;
  return {
    ...fields,
    applicablePlatforms: parseList(fields.applicablePlatforms),
    applicableContentTypes: parseList(fields.applicableContentTypes),
    displayOrder: fields.displayOrder ? Number(fields.displayOrder) : undefined,
  };
}

function parseList(value: string | undefined) {
  return String(value ?? "").split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
}

function objectBody(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonValue(value: unknown, fallback: Record<string, never> | never[]) {
  return value && typeof value === "object" ? value as Record<string, unknown> | unknown[] : fallback;
}

async function normalizeProjectSource(body: Record<string, unknown>) {
  const sourceType = stringValue(body.sourceType);
  if (sourceType !== "manual" && sourceType !== "external_api") {
    return {
      namespace: stringValue(body.sourceNamespace),
      recordId: stringOrNull(body.sourceRecordId),
      snapshot: jsonValue(body.sourceSnapshot, {}),
    };
  }
  const manifest = await sourceManifestFromAdapter({
    sourceType,
    sourceNamespace: stringValue(body.sourceNamespace),
    sourceRecordId: stringValue(body.sourceRecordId),
    sourceVersion: stringValue(body.sourceVersion) || "initial-v1",
    sourceSnapshot: objectBody(body.sourceSnapshot),
    sourceUrl: stringOrNull(body.sourceUrl),
    contentHash: stringOrNull(body.contentHash),
    authorizationStatus: stringValue(body.authorizationStatus),
  });
  return { namespace: manifest.namespace, recordId: manifest.recordId, snapshot: manifest.snapshot };
}

async function normalizeMarketingSource(body: Record<string, unknown>) {
  return sourceManifestFromAdapter({
    sourceType: stringValue(body.sourceNamespace) === "manual" ? "manual" : "external_api",
    sourceNamespace: stringValue(body.sourceNamespace),
    sourceRecordId: stringValue(body.sourceRecordId),
    sourceVersion: stringValue(body.sourceVersion),
    sourceSnapshot: objectBody(body.sourceSnapshot),
    sourceUrl: stringOrNull(body.sourceUrl),
    contentHash: stringOrNull(body.contentHash),
    authorizationStatus: stringValue(body.authorizationStatus),
  });
}

async function sourceManifestFromAdapter(input: {
  sourceType: string;
  sourceNamespace: string;
  sourceRecordId: string;
  sourceVersion: string;
  sourceSnapshot: Record<string, unknown>;
  sourceUrl: string | null;
  contentHash: string | null;
  authorizationStatus: string;
}) {
  if (input.sourceType === "manual" && input.sourceNamespace !== "manual") {
    throw new MarketingError(400, "marketing_manual_source_namespace_invalid", "Manual sources must use the manual namespace");
  }
  const adapter = input.sourceType === "manual"
    ? new ManualMarketingSourceAdapter()
    : new ExternalMarketingSourceAdapter();
  try {
    const manifest = await adapter.toManifest({
      ...input.sourceSnapshot,
      namespace: input.sourceNamespace,
      recordId: input.sourceRecordId,
      version: input.sourceVersion,
      sourceUrl: input.sourceUrl ?? undefined,
      contentHash: input.contentHash ?? undefined,
      authorizationStatus: input.authorizationStatus,
    });
    if (manifest.authorizationStatus !== "owned" && manifest.authorizationStatus !== "authorized") {
      throw new MarketingError(400, "marketing_source_authorization_required", "Marketing sources must be owned or authorized");
    }
    return manifest;
  } catch (cause) {
    if (cause instanceof MarketingError) throw cause;
    if (cause instanceof Error && cause.message.startsWith("marketing_")) {
      throw new MarketingError(400, cause.message, "Marketing source is invalid or lacks authorization");
    }
    throw cause;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assetArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const asset = objectBody(item);
    return {
      type: stringValue(asset.type) as "video" | "image" | "cover" | "subtitle" | "document",
      storageObjectId: stringOrUndefined(asset.storageObjectId), deliveryUrl: stringOrUndefined(asset.deliveryUrl),
      sha256: stringOrUndefined(asset.sha256), contentType: stringOrUndefined(asset.contentType),
      sizeBytes: typeof asset.sizeBytes === "number" ? asset.sizeBytes : undefined, expiresAt: stringOrUndefined(asset.expiresAt),
    };
  });
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.map(objectBody) : [];
}

function manualReviewDimensions(value: unknown) {
  const dimensions = objectBody(value);
  if (typeof dimensions.facts !== "boolean" || typeof dimensions.assetRights !== "boolean"
    || typeof dimensions.disclosure !== "boolean" || typeof dimensions.platformRules !== "boolean") {
    throw new MarketingError(400, "marketing_manual_review_dimensions_invalid", "Manual review dimensions must be explicit booleans");
  }
  return {
    facts: dimensions.facts,
    assetRights: dimensions.assetRights,
    disclosure: dimensions.disclosure,
    platformRules: dimensions.platformRules,
  };
}

function headerString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requireExecutorEnvelope(body: Record<string, unknown>) {
  if (body.schemaVersion !== "v1" || !stringValue(body.eventId) || !stringValue(body.occurredAt) || !stringValue(body.idempotencyKey)) {
    throw new MarketingError(400, "marketing_executor_envelope_invalid", "Marketing executor request envelope is invalid");
  }
  return {
    schemaVersion: "v1",
    eventId: stringValue(body.eventId),
    occurredAt: stringValue(body.occurredAt),
    idempotencyKey: stringValue(body.idempotencyKey),
  };
}

function executorEnvelope(envelope: { schemaVersion: string; eventId: string; occurredAt: string; idempotencyKey: string }, body: Record<string, unknown>): HttpResponse {
  return { status: 200, body: { ...envelope, ...body } };
}

function data(status: number, value: Record<string, unknown>): HttpResponse {
  return { status, body: { data: value } };
}

function error(status: number, code: string, message: string): HttpResponse {
  return { status, body: { error: { code, message } } };
}
