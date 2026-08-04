export const routeAuthPolicyNames = [
  "public",
  "user",
  "optional-user",
  "admin",
  "optional-admin",
  "signed-webhook",
  "test-only",
  "deny",
] as const;

export type RouteAuthPolicy = (typeof routeAuthPolicyNames)[number];

export type RouteAuthMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT";

export interface RouteAuthRegistration {
  readonly method: RouteAuthMethod;
  readonly path: string;
  readonly policy: RouteAuthPolicy;
  readonly id: string;
}

export interface RouteAuthResolution {
  method: string;
  pathname: string;
  policy: RouteAuthPolicy;
  source: "registered" | "api-default";
  registration?: RouteAuthRegistration;
  params: Readonly<Record<string, string>>;
}

interface CompiledRegistration {
  registration: RouteAuthRegistration;
  parameterNames: string[];
  matcher: RegExp;
}

const parameterSegmentPattern = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;

export class RouteAuthPolicyRegistry {
  readonly #compiled: CompiledRegistration[];
  readonly coverage: "partial" | "complete";

  constructor(
    registrations: readonly RouteAuthRegistration[],
    options: { coverage?: "partial" | "complete" } = {},
  ) {
    this.coverage = options.coverage ?? "partial";
    const seenIds = new Set<string>();
    const seenRouteShapes = new Set<string>();

    this.#compiled = registrations.map((registration) => {
      if (!registration.id.trim()) {
        throw new Error("route_auth_registration_id_required");
      }
      if (seenIds.has(registration.id)) {
        throw new Error(`route_auth_registration_id_duplicate:${registration.id}`);
      }
      seenIds.add(registration.id);

      const compiled = compileRegistration(registration);
      const routeShape = `${registration.method} ${normalizedRouteShape(registration.path)}`;
      if (seenRouteShapes.has(routeShape)) {
        throw new Error(`route_auth_registration_conflict:${routeShape}`);
      }
      seenRouteShapes.add(routeShape);
      return compiled;
    });
  }

  resolve(method: string, requestUrl: string | URL): RouteAuthResolution | null {
    const normalizedMethod = method.trim().toUpperCase();
    const pathname = requestUrl instanceof URL
      ? requestUrl.pathname
      : new URL(requestUrl, "http://route-auth.local").pathname;

    for (const compiled of this.#compiled) {
      if (compiled.registration.method !== normalizedMethod) {
        continue;
      }
      const match = compiled.matcher.exec(pathname);
      if (!match) {
        continue;
      }

      const params = Object.fromEntries(
        compiled.parameterNames.map((name, index) => [
          name,
          decodeRouteParameter(match[index + 1]),
        ]),
      );
      return {
        method: normalizedMethod,
        pathname,
        policy: compiled.registration.policy,
        source: "registered",
        registration: compiled.registration,
        params,
      };
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return {
        method: normalizedMethod,
        pathname,
        policy: "deny",
        source: "api-default",
        params: {},
      };
    }

    return null;
  }

  registrations(): readonly RouteAuthRegistration[] {
    return this.#compiled.map(({ registration }) => registration);
  }

  assertEnforcementReady(): void {
    if (this.coverage !== "complete") {
      throw new Error("route_auth_registry_coverage_incomplete");
    }
  }
}

function compileRegistration(registration: RouteAuthRegistration): CompiledRegistration {
  if (!registration.path.startsWith("/api/")) {
    throw new Error(`route_auth_registration_path_invalid:${registration.path}`);
  }
  if (registration.path.includes("?") || registration.path.includes("#")) {
    throw new Error(`route_auth_registration_path_invalid:${registration.path}`);
  }

  const parameterNames: string[] = [];
  const matcherSegments = registration.path.split("/").map((segment) => {
    const parameterMatch = segment.match(parameterSegmentPattern);
    if (!parameterMatch) {
      if (segment.includes("{") || segment.includes("}")) {
        throw new Error(`route_auth_registration_parameter_invalid:${registration.path}`);
      }
      return escapeRegExp(segment);
    }

    const parameterName = parameterMatch[1];
    if (parameterNames.includes(parameterName)) {
      throw new Error(`route_auth_registration_parameter_duplicate:${registration.path}`);
    }
    parameterNames.push(parameterName);
    return "([^/]+)";
  });

  return {
    registration: Object.freeze({ ...registration }),
    parameterNames,
    matcher: new RegExp(`^${matcherSegments.join("/")}$`),
  };
}

function normalizedRouteShape(path: string): string {
  return path
    .split("/")
    .map((segment) => parameterSegmentPattern.test(segment) ? "{}" : segment)
    .join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeRouteParameter(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type RouteInventoryTuple = readonly [
  method: RouteAuthMethod,
  path: string,
  id?: string,
];

function inventoryRegistrations(
  policy: RouteAuthPolicy,
  routes: readonly RouteInventoryTuple[],
): RouteAuthRegistration[] {
  return routes.map(([method, path, id]) => ({
    id: id ?? `inventory.${method.toLowerCase()}.${path
      .slice("/api/".length)
      .replaceAll(/[^A-Za-z0-9]+/g, ".")
      .replaceAll(/^\.|\.$/g, "")}`,
    method,
    path,
    policy,
  }));
}

export const criticalApiRouteAuthRegistrations = [
  { id: "community.read", method: "GET", path: "/api/community", policy: "public" },
  { id: "announcements.read", method: "GET", path: "/api/announcements", policy: "public" },
  { id: "community.feedback", method: "POST", path: "/api/community/feedback", policy: "public" },
  { id: "community.features.create", method: "POST", path: "/api/community/features", policy: "public" },
  { id: "community.features.vote", method: "POST", path: "/api/community/features/{featureId}/vote", policy: "public" },
  { id: "public.legal-documents", method: "GET", path: "/api/public/legal-documents", policy: "public" },
  { id: "public.customer-support", method: "GET", path: "/api/public/customer-support", policy: "public" },
  { id: "admin.login", method: "POST", path: "/api/admin/auth/login", policy: "public" },
  { id: "admin.me", method: "GET", path: "/api/admin/auth/me", policy: "admin" },
  { id: "admin.logout", method: "POST", path: "/api/admin/auth/logout", policy: "optional-admin" },
  { id: "admin.profile", method: "PATCH", path: "/api/admin/auth/profile", policy: "admin" },
  { id: "admin.password", method: "POST", path: "/api/admin/auth/password", policy: "admin" },
  { id: "admin.sessions.read", method: "GET", path: "/api/admin/auth/sessions", policy: "admin" },
  { id: "admin.sessions.revoke-other", method: "POST", path: "/api/admin/auth/sessions/revoke-other", policy: "admin" },
  { id: "admin.dashboard.overview", method: "GET", path: "/api/admin/dashboard/overview", policy: "admin" },
  { id: "auth.code.request", method: "POST", path: "/api/auth/code/request", policy: "public" },
  { id: "auth.code.verify", method: "POST", path: "/api/auth/code/verify", policy: "public" },
  { id: "auth.password.login", method: "POST", path: "/api/auth/password/login", policy: "public" },
  { id: "auth.team-member.login", method: "POST", path: "/api/auth/team-member/password/login", policy: "public" },
  { id: "auth.wechat.start", method: "GET", path: "/api/auth/wechat/start", policy: "public" },
  { id: "auth.wechat.callback", method: "GET", path: "/api/auth/wechat/callback", policy: "public" },
  { id: "auth.session", method: "GET", path: "/api/auth/session", policy: "user" },
  { id: "auth.credit-balance", method: "GET", path: "/api/auth/credit-balance", policy: "user" },
  { id: "auth.invite-summary", method: "GET", path: "/api/auth/invite-summary", policy: "user" },
  { id: "auth.profile", method: "PATCH", path: "/api/auth/profile", policy: "user" },
  { id: "auth.password.change", method: "POST", path: "/api/auth/password", policy: "user" },
  { id: "auth.logout", method: "POST", path: "/api/auth/logout", policy: "optional-user" },
  { id: "auth.dev.challenge", method: "GET", path: "/api/auth/dev/challenges/{challengeId}", policy: "test-only" },
  { id: "payment.provider-callback", method: "POST", path: "/api/payment-provider-callbacks/{provider}", policy: "signed-webhook" },
  { id: "generation.provider-webhook", method: "POST", path: "/api/provider-webhooks/generation/{provider}", policy: "signed-webhook" },
  { id: "billing.payment-callback.mock", method: "POST", path: "/api/billing/payment-callback/mock", policy: "test-only" },
  { id: "membership.plans", method: "GET", path: "/api/membership/plans", policy: "user" },
  { id: "membership.status", method: "GET", path: "/api/membership/status", policy: "user" },
  { id: "membership.orders", method: "POST", path: "/api/membership/orders", policy: "user" },
  { id: "membership.checkout", method: "POST", path: "/api/membership/checkout", policy: "user" },
  { id: "billing.packages", method: "GET", path: "/api/billing/packages", policy: "user" },
  { id: "billing.orders", method: "POST", path: "/api/billing/orders", policy: "user" },
  { id: "billing.payment-intents", method: "POST", path: "/api/billing/payment-intents", policy: "user" },
  { id: "storage.upload-sessions.create", method: "POST", path: "/api/storage/upload-sessions", policy: "user" },
  { id: "creator.media-library", method: "GET", path: "/api/creator/media-library", policy: "user" },
  { id: "creator.media-library.summary", method: "GET", path: "/api/creator/media-library/summary", policy: "user" },
  { id: "creator.prompt-skills.catalog", method: "GET", path: "/api/creator/prompt-skills/catalog", policy: "user" },
  { id: "creator.prompt-skills.library", method: "GET", path: "/api/creator/prompt-skills/library", policy: "user" },
  { id: "creator.prompt-marketplace.list", method: "GET", path: "/api/creator/prompt-marketplace", policy: "user" },
  { id: "creator.prompt-marketplace.library", method: "GET", path: "/api/creator/prompt-marketplace/library", policy: "user" },
  { id: "creator.prompt-marketplace.default.set", method: "PUT", path: "/api/creator/prompt-marketplace/defaults/{category}", policy: "user" },
  { id: "creator.prompt-marketplace.default.clear", method: "DELETE", path: "/api/creator/prompt-marketplace/defaults/{category}", policy: "user" },
  { id: "creator.prompt-marketplace.create", method: "POST", path: "/api/creator/prompt-marketplace/items", policy: "user" },
  { id: "creator.prompt-marketplace.update", method: "PATCH", path: "/api/creator/prompt-marketplace/items/{itemId}", policy: "user" },
  { id: "creator.prompt-marketplace.purchase", method: "POST", path: "/api/creator/prompt-marketplace/items/{itemId}/purchase", policy: "user" },
  { id: "creator.prompt-marketplace.use", method: "POST", path: "/api/creator/prompt-marketplace/items/{itemId}/use", policy: "user" },
  { id: "creator.prompt-marketplace.rate", method: "POST", path: "/api/creator/prompt-marketplace/items/{itemId}/rating", policy: "user" },
  { id: "creator.prompt-marketplace.remove", method: "DELETE", path: "/api/creator/prompt-marketplace/library/{itemId}", policy: "user" },
  { id: "creator.prompt-marketplace.delete", method: "DELETE", path: "/api/creator/prompt-marketplace/items/{itemId}", policy: "user" },
  { id: "creator.storyboard-prompt.packages", method: "GET", path: "/api/creator/storyboard-prompt/packages", policy: "public" },
] as const satisfies readonly RouteAuthRegistration[];

const adminApiRouteAuthRegistrations = inventoryRegistrations("admin", [
  ["GET", "/api/admin/dashboard/queue-health"],
  ["GET", "/api/admin/dashboard/model-health"],
  ["GET", "/api/admin/dashboard/recent-events"],
  ["GET", "/api/admin/models"],
  ["POST", "/api/admin/models"],
  ["GET", "/api/admin/model-templates"],
  ["POST", "/api/admin/models/validate-draft"],
  ["POST", "/api/admin/models/{modelId}/probe"],
  ["POST", "/api/admin/models/{modelId}/duplicate"],
  ["PATCH", "/api/admin/models/{modelId}/status"],
  ["GET", "/api/admin/models/{modelId}/revisions"],
  ["POST", "/api/admin/models/{modelId}/rollback"],
  ["GET", "/api/admin/models/{modelId}"],
  ["PATCH", "/api/admin/models/{modelId}"],
  ["DELETE", "/api/admin/models/{modelId}"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/admin/team-permission-accounts"],
  ["GET", "/api/admin/users/{userId}/team-plan-limit"],
  ["PATCH", "/api/admin/users/{userId}/team-plan-limit"],
  ["GET", "/api/admin/users/{userId}/subaccounts"],
  ["POST", "/api/admin/users/{userId}/credits/grant"],
  ["POST", "/api/admin/users/{userId}/contact/reveal"],
  ["POST", "/api/admin/users/{userId}/membership/grant"],
  ["PATCH", "/api/admin/users/{userId}/profile"],
  ["PATCH", "/api/admin/users/{userId}/status"],
  ["POST", "/api/admin/users/{userId}/credits/deduct"],
  ["POST", "/api/admin/users/{userId}/credits/frozen/restore"],
  ["GET", "/api/admin/users/{userId}/credits/ledger"],
  ["GET", "/api/admin/users/{userId}/model-requests"],
  ["GET", "/api/admin/scene-prompt/templates"],
  ["POST", "/api/admin/scene-prompt/templates"],
  ["POST", "/api/admin/scene-prompt/templates/{templateId}/copy"],
  ["PATCH", "/api/admin/scene-prompt/templates/{templateId}/status"],
  ["PUT", "/api/admin/scene-prompt/templates/{templateId}"],
  ["GET", "/api/admin/prop-prompt/templates"],
  ["POST", "/api/admin/prop-prompt/templates"],
  ["POST", "/api/admin/prop-prompt/templates/{templateId}/copy"],
  ["PATCH", "/api/admin/prop-prompt/templates/{templateId}/status"],
  ["PUT", "/api/admin/prop-prompt/templates/{templateId}"],
  ["GET", "/api/admin/shot-prompt/templates"],
  ["POST", "/api/admin/shot-prompt/templates"],
  ["POST", "/api/admin/shot-prompt/templates/{templateId}/copy"],
  ["PATCH", "/api/admin/shot-prompt/templates/{templateId}/status"],
  ["PUT", "/api/admin/shot-prompt/templates/{templateId}"],
  ["GET", "/api/admin/prompt-marketplace"],
  ["POST", "/api/admin/prompt-marketplace/items"],
  ["PATCH", "/api/admin/prompt-marketplace/items/{itemId}"],
  ["PUT", "/api/admin/prompt-defaults/{category}"],
  ["GET", "/api/admin/image-prompt/styles"],
  ["POST", "/api/admin/image-prompt/styles"],
  ["POST", "/api/admin/image-prompt/styles/{styleId}/copy"],
  ["PATCH", "/api/admin/image-prompt/styles/{styleId}/status"],
  ["PUT", "/api/admin/image-prompt/styles/{styleId}"],
  ["GET", "/api/admin/character-prompt/templates"],
  ["POST", "/api/admin/character-prompt/templates"],
  ["POST", "/api/admin/character-prompt/templates/{templateId}/copy"],
  ["PATCH", "/api/admin/character-prompt/templates/{templateId}/status"],
  ["PUT", "/api/admin/character-prompt/templates/{templateId}"],
  ["POST", "/api/admin/character-prompt/compose"],
  ["GET", "/api/admin/storyboard-prompt/packages"],
  ["POST", "/api/admin/storyboard-prompt/packages"],
  ["POST", "/api/admin/storyboard-prompt/packages/{packageId}/copy"],
  ["PATCH", "/api/admin/storyboard-prompt/packages/{packageId}/status"],
  ["PUT", "/api/admin/storyboard-prompt/packages/{packageId}"],
  ["GET", "/api/admin/storyboard-prompt/templates"],
  ["POST", "/api/admin/storyboard-prompt/templates"],
  ["POST", "/api/admin/storyboard-prompt/compose"],
  ["POST", "/api/admin/storyboard-prompt/test-generate"],
  ["GET", "/api/admin/storyboard-prompt/export"],
  ["GET", "/api/admin/risks"],
  ["GET", "/api/admin/exports/risks.csv"],
  ["POST", "/api/admin/risks/{riskId}/review"],
  ["GET", "/api/admin/audit-events"],
  ["GET", "/api/admin/exports/audit-events.csv"],
  ["GET", "/api/admin/announcements"],
  ["POST", "/api/admin/announcements"],
  ["PATCH", "/api/admin/announcements/{announcementId}"],
  ["DELETE", "/api/admin/announcements/{announcementId}"],
  ["GET", "/api/admin/membership/plans"],
  ["GET", "/api/admin/membership/grantable-plans"],
  ["POST", "/api/admin/membership/plans/reorder"],
  ["POST", "/api/admin/membership/plans"],
  ["DELETE", "/api/admin/membership/plans/{planId}"],
  ["GET", "/api/admin/invite-rewards/config"],
  ["POST", "/api/admin/invite-rewards/config"],
  ["GET", "/api/admin/credit-packages"],
  ["POST", "/api/admin/credit-packages"],
  ["GET", "/api/admin/direct-recharge/packages"],
  ["POST", "/api/admin/direct-recharge/packages"],
  ["POST", "/api/admin/direct-recharge/packages/reorder"],
  ["DELETE", "/api/admin/direct-recharge/packages/{packageId}"],
  ["GET", "/api/admin/settings"],
  ["GET", "/api/admin/settings/canvas-agent"],
  ["GET", "/api/admin/settings/revisions"],
  ["POST", "/api/admin/settings/{settingKey}/rollback"],
  ["PATCH", "/api/admin/settings/{settingKey}"],
  ["GET", "/api/admin/batch-image-prompt-presets"],
  ["PATCH", "/api/admin/batch-image-prompt-presets"],
  ["GET", "/api/admin/official-assets"],
  ["POST", "/api/admin/official-assets"],
  ["GET", "/api/admin/official-assets/{assetId}"],
  ["PATCH", "/api/admin/official-assets/{assetId}"],
  ["POST", "/api/admin/official-assets/{assetId}/archive"],
  ["POST", "/api/admin/official-assets/{assetId}/restore"],
  ["GET", "/api/admin/legal-documents"],
  ["POST", "/api/admin/legal-documents"],
  ["PATCH", "/api/admin/legal-documents/{documentId}"],
  ["POST", "/api/admin/legal-documents/{documentId}/enable"],
  ["DELETE", "/api/admin/legal-documents/{documentId}"],
  ["POST", "/api/admin/secret-references"],
  ["POST", "/api/admin/secret-references/{secretId}/probe"],
  ["POST", "/api/admin/secret-references/{secretId}/reveal"],
  ["PATCH", "/api/admin/secret-references/{secretId}"],
  ["DELETE", "/api/admin/secret-references/{secretId}"],
  ["GET", "/api/admin/admin-accounts"],
  ["POST", "/api/admin/admin-accounts"],
  ["POST", "/api/admin/admin-accounts/{accountId}/password"],
  ["PATCH", "/api/admin/admin-accounts/{accountId}"],
  ["GET", "/api/admin/sms-records"],
  ["GET", "/api/admin/resources/summary"],
  ["GET", "/api/admin/resources"],
  ["DELETE", "/api/admin/resources/{resourceId}"],
  ["POST", "/api/admin/ops/tasks/{taskId}/retry"],
  ["POST", "/api/admin/ops/payments/{paymentId}/repair-credit"],
  ["GET", "/api/admin/ops/items"],
  ["GET", "/api/admin/ops/canvas-agent-metrics"],
  ["GET", "/api/admin/ops/canvas-canary-metrics"],
  ["GET", "/api/admin/ops/generation-queues"],
  ["POST", "/api/admin/ops/generation-queues/jobs"],
  ["POST", "/api/admin/ops/tasks/manual-settle"],
  ["POST", "/api/admin/ops/tasks/retry"],
  ["POST", "/api/admin/ops/tasks/recover"],
  ["POST", "/api/admin/ops/tasks/retry-finalize"],
  ["POST", "/api/admin/ops/tasks/retry-persist-asset"],
  ["POST", "/api/admin/ops/payment-risks/mark-reviewed"],
  ["POST", "/api/admin/ops/payments/repair-paid-without-credit"],
]);

const userApiRouteAuthRegistrations = inventoryRegistrations("user", [
  ["GET", "/api/creator/project-styles"],
  ["GET", "/api/billing/payment-intents/{paymentIntentId}"],
  ["GET", "/api/billing/orders/{orderId}"],
  ["POST", "/api/billing/enterprise-contact-requests"],
  ["GET", "/api/storage/objects/{storageObjectId}/content"],
  ["GET", "/api/storage/upload-sessions/{uploadSessionId}"],
  ["GET", "/api/storage/upload-sessions/{uploadSessionId}/content"],
  ["PUT", "/api/storage/upload-sessions/{uploadSessionId}/blob"],
  ["POST", "/api/storage/upload-sessions/{uploadSessionId}/complete"],
  ["POST", "/api/storage/upload-sessions/{uploadSessionId}/abort"],
  ["POST", "/api/storage/repair"],
  ["GET", "/api/director-desks"],
  ["POST", "/api/director-desks"],
  ["GET", "/api/director-desks/{deskKey}/scene"],
  ["PUT", "/api/director-desks/{deskKey}/scene"],
  ["POST", "/api/director-desks/{deskKey}/open"],
  ["PATCH", "/api/director-desks/{deskKey}"],
  ["DELETE", "/api/director-desks/{deskKey}"],
  ["GET", "/api/task-center/tasks"],
  ["POST", "/api/generation/image-tasks"],
  ["GET", "/api/canvas/{canvasProjectId}/head"],
  ["GET", "/api/canvas/{canvasProjectId}/session"],
  ["PUT", "/api/canvas/{canvasProjectId}/session"],
  ["GET", "/api/canvas/{canvasProjectId}/live"],
  ["POST", "/api/canvas/{canvasProjectId}/telemetry/frontend-errors"],
  ["GET", "/api/canvas/{canvasProjectId}/nodes/{nodeKey}/runs"],
  ["POST", "/api/canvas/{canvasProjectId}/artifacts/{artifactId}/select"],
  ["POST", "/api/canvas/{canvasProjectId}/nodes/{nodeKey}/run"],
  ["POST", "/api/canvas/{canvasProjectId}/generation-batches"],
  ["GET", "/api/canvas/{canvasProjectId}/generation-batches/{batchId}"],
  ["POST", "/api/canvas/{canvasProjectId}/generation-batches/{batchId}/reconcile"],
  ["POST", "/api/canvas/{canvasProjectId}/generation-batches/{batchId}/cancel"],
  ["GET", "/api/canvas/{canvasProjectId}/generation-history"],
  ["DELETE", "/api/canvas/{canvasProjectId}/generation-history"],
  ["DELETE", "/api/canvas/{canvasProjectId}/generation-history/{runId}"],
  ["GET", "/api/canvas/{canvasProjectId}/settings"],
  ["PATCH", "/api/canvas/{canvasProjectId}/settings"],
  ["GET", "/api/canvas/{canvasProjectId}/characters"],
  ["POST", "/api/canvas/{canvasProjectId}/characters"],
  ["GET", "/api/canvas/{canvasProjectId}/characters/{characterId}"],
  ["PATCH", "/api/canvas/{canvasProjectId}/characters/{characterId}"],
  ["DELETE", "/api/canvas/{canvasProjectId}/characters/{characterId}"],
  ["POST", "/api/canvas/{canvasProjectId}/characters/{characterId}/copy"],
  ["POST", "/api/canvas/{canvasProjectId}/characters/{characterId}/references"],
  ["PATCH", "/api/canvas/{canvasProjectId}/characters/{characterId}/references/{referenceId}"],
  ["DELETE", "/api/canvas/{canvasProjectId}/characters/{characterId}/references/{referenceId}"],
  ["POST", "/api/canvas/{canvasProjectId}/uploads/fingerprint"],
  ["GET", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/memories"],
  ["PATCH", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/memories/{memoryId}"],
  ["DELETE", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/memories/{memoryId}"],
  ["POST", "/api/canvas/{canvasProjectId}/style-reference-assets"],
  ["POST", "/api/canvas/{canvasProjectId}/style-reference-assets/import"],
  ["GET", "/api/canvas/{canvasProjectId}/storage-health"],
  ["POST", "/api/canvas/{canvasProjectId}/nodes/{nodeKey}/director-artifacts"],
  ["PATCH", "/api/canvas/{canvasProjectId}/artifacts/{artifactId}/tags"],
  ["GET", "/api/canvas/{canvasProjectId}/asset-references"],
  ["POST", "/api/canvas/{canvasProjectId}/derivations"],
  ["GET", "/api/canvas/{canvasProjectId}/derivations/{derivationId}"],
  ["POST", "/api/canvas/{canvasProjectId}/derivations/{derivationId}/attach-task"],
  ["POST", "/api/canvas/{canvasProjectId}/derivations/{derivationId}/complete"],
  ["POST", "/api/canvas/{canvasProjectId}/derivations/{derivationId}/fail"],
  ["POST", "/api/canvas/{canvasProjectId}/image-batch-groups"],
  ["GET", "/api/canvas/{canvasProjectId}/image-batch-groups/{groupId}"],
  ["POST", "/api/canvas/{canvasProjectId}/image-batch-groups/{groupId}/select"],
  ["POST", "/api/canvas/{canvasProjectId}/annotation-layers"],
  ["GET", "/api/canvas/{canvasProjectId}/annotation-layers"],
  ["POST", "/api/canvas/{canvasProjectId}/card-snapshots"],
  ["GET", "/api/canvas/{canvasProjectId}/card-snapshots"],
  ["GET", "/api/canvas/{canvasProjectId}/agent-models"],
  ["POST", "/api/canvas/{canvasProjectId}/conversations"],
  ["GET", "/api/canvas/{canvasProjectId}/conversations"],
  ["PATCH", "/api/canvas/{canvasProjectId}/conversations"],
  ["DELETE", "/api/canvas/{canvasProjectId}/conversations"],
  ["GET", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/messages"],
  ["POST", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/messages"],
  ["GET", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/file-grants"],
  ["POST", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/file-grants"],
  ["DELETE", "/api/canvas/{canvasProjectId}/conversations/{conversationId}/file-grants/{grantId}"],
  ["GET", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/events"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/pause"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/resume"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/stop"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/replan"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/interject"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/approve"],
  ["POST", "/api/canvas/{canvasProjectId}/agent-tasks/{taskId}/rewind"],
  ["GET", "/api/canvas-library/configs"],
  ["POST", "/api/canvas-library/configs"],
  ["GET", "/api/canvas-library/configs/{configId}"],
  ["DELETE", "/api/canvas-library/configs/{configId}"],
  ["GET", "/api/canvas-library/configs/{configId}/versions"],
  ["POST", "/api/canvas-library/configs/{configId}/versions"],
  ["GET", "/api/projects/{projectId}/detail"],
  ["GET", "/api/projects/{projectId}/export-tasks"],
  ["POST", "/api/projects/{projectId}/episodes"],
  ["PATCH", "/api/projects/{projectId}/episodes/{episodeId}"],
  ["DELETE", "/api/projects/{projectId}/episodes/{episodeId}"],
  ["GET", "/api/episodes/{episodeId}/workbench"],
  ["GET", "/api/episodes/{episodeId}/assets"],
  ["POST", "/api/episodes/{episodeId}/assets"],
  ["POST", "/api/episodes/{episodeId}/assets/import"],
  ["PATCH", "/api/episodes/{episodeId}/assets/{assetId}"],
  ["DELETE", "/api/episodes/{episodeId}/assets/{assetId}"],
  ["DELETE", "/api/episodes/{episodeId}/assets"],
  ["POST", "/api/episodes/{episodeId}/assets/{assetId}/save-to-library"],
  ["GET", "/api/episodes/{episodeId}/storyboards"],
  ["GET", "/api/generation-config"],
  ["GET", "/api/episodes/{episodeId}/batch-image-model-options"],
  ["GET", "/api/episodes/{episodeId}/generation-config"],
  ["POST", "/api/episodes/{episodeId}/generation/video-tasks"],
  ["POST", "/api/episodes/{episodeId}/file-resources/bind"],
  ["POST", "/api/episodes/{episodeId}/assets/{assetId}/set-fixed-image"],
  ["DELETE", "/api/episodes/{episodeId}/assets/{assetId}/fixed-image"],
  ["GET", "/api/episodes/{episodeId}/assets/{assetId}/conversation"],
  ["GET", "/api/episodes/{episodeId}/storyboards/{storyboardId}/conversation"],
  ["POST", "/api/episodes/{episodeId}/assets/{assetId}/conversation/messages"],
  ["POST", "/api/episodes/{episodeId}/storyboards/{storyboardId}/conversation/messages"],
  ["DELETE", "/api/episodes/{episodeId}/assets/{assetId}/conversation/messages/{messageId}"],
  ["DELETE", "/api/episodes/{episodeId}/storyboards/{storyboardId}/conversation/messages/{messageId}"],
  ["DELETE", "/api/episodes/{episodeId}/file-resources/{resourceId}"],
  ["POST", "/api/episodes/{episodeId}/storyboards/{storyboardId}/set-current-image"],
  ["POST", "/api/episodes/{episodeId}/storyboards/{storyboardId}/set-current-video"],
  ["POST", "/api/episodes/{episodeId}/export-tasks"],
  ["GET", "/api/episodes/{episodeId}/generation-tasks"],
  ["POST", "/api/generation-tasks/batch"],
  ["POST", "/api/generation-tasks/{taskId}/cancel"],
  ["GET", "/api/generation-tasks/{taskId}"],
  ["PATCH", "/api/episodes/{episodeId}/generation-drafts/{targetType}/{targetId}"],
  ["GET", "/api/creator/team/overview"],
  ["GET", "/api/creator/team/members"],
  ["POST", "/api/creator/team/members"],
  ["PATCH", "/api/creator/team/members/{memberId}"],
  ["GET", "/api/creator/team/assignable-resources"],
  ["GET", "/api/creator/credits/ledger"],
  ["GET", "/api/creator/state"],
  ["GET", "/api/creator/episode-events"],
  ["POST", "/api/creator/episode-events"],
  ["GET", "/api/creator/projects"],
  ["GET", "/api/creator/projects/{projectId}/brand-kit"],
  ["PATCH", "/api/creator/projects/{projectId}/brand-kit"],
  ["GET", "/api/creator/canvas-projects"],
  ["POST", "/api/creator/canvas-projects"],
  ["GET", "/api/creator/canvas-projects/{canvasProjectId}"],
  ["GET", "/api/creator/canvas-projects/{canvasProjectId}/revisions"],
  ["GET", "/api/creator/canvas-projects/{canvasProjectId}/revisions/{revisionId}"],
  ["GET", "/api/creator/canvas-projects/{canvasProjectId}/canvas"],
  ["PUT", "/api/creator/canvas-projects/{canvasProjectId}/canvas"],
  ["POST", "/api/creator/canvas-projects/{canvasProjectId}/restore"],
  ["PATCH", "/api/creator/canvas-projects/{canvasProjectId}"],
  ["DELETE", "/api/creator/canvas-projects/{canvasProjectId}"],
  ["GET", "/api/creator/canvases"],
  ["POST", "/api/creator/canvases"],
  ["GET", "/api/creator/canvases/{canvasId}"],
  ["PATCH", "/api/creator/canvases/{canvasId}"],
  ["DELETE", "/api/creator/canvases/{canvasId}"],
  ["POST", "/api/creator/canvases/{canvasId}/restore"],
  ["GET", "/api/creator/canvases/{canvasId}/document"],
  ["PUT", "/api/creator/canvases/{canvasId}/document"],
  ["GET", "/api/creator/canvases/{canvasId}/revisions"],
  ["GET", "/api/creator/canvases/{canvasId}/revisions/{revisionId}"],
  ["GET", "/api/creator/projects/{projectId}/detail"],
  ["GET", "/api/creator/projects/{projectId}/episodes"],
  ["GET", "/api/creator/scripts/{scriptId}/sections"],
  ["POST", "/api/creator/scripts/{scriptId}/sections"],
  ["PATCH", "/api/creator/scripts/{scriptId}/sections/{sectionId}"],
  ["DELETE", "/api/creator/scripts/{scriptId}/sections/{sectionId}"],
  ["PATCH", "/api/creator/scripts/{scriptId}"],
  ["DELETE", "/api/creator/scripts/{scriptId}"],
  ["POST", "/api/creator/project/select"],
  ["POST", "/api/creator/projects/{projectId}/ai-storyboard-preview/commit"],
  ["POST", "/api/creator/scripts/ai-script-analysis"],
  ["POST", "/api/creator/projects/{projectId}/ai-script-analysis"],
  ["POST", "/api/creator/projects/{projectId}/ai-storyboard-preview"],
  ["POST", "/api/creator/scripts/import-document"],
  ["GET", "/api/creator/scripts"],
  ["POST", "/api/creator/project/create"],
  ["PATCH", "/api/creator/project"],
  ["DELETE", "/api/creator/project"],
  ["POST", "/api/creator/project/cover"],
  ["POST", "/api/creator/parse"],
  ["GET", "/api/creator/tool-presets"],
  ["POST", "/api/creator/tool-presets"],
  ["POST", "/api/creator/tool-presets/{presetId}/duplicate"],
  ["GET", "/api/creator/tool-presets/{presetId}/versions"],
  ["GET", "/api/creator/tool-presets/{presetId}/versions/{versionId}"],
  ["GET", "/api/creator/tool-presets/{presetId}"],
  ["PATCH", "/api/creator/tool-presets/{presetId}"],
  ["DELETE", "/api/creator/tool-presets/{presetId}"],
  ["GET", "/api/creator/brand-kits"],
  ["POST", "/api/creator/brand-kits"],
  ["POST", "/api/creator/brand-kits/{kitId}/duplicate"],
  ["PATCH", "/api/creator/brand-kits/{kitId}/assets/{assetId}"],
  ["DELETE", "/api/creator/brand-kits/{kitId}/assets/{assetId}"],
  ["POST", "/api/creator/brand-kits/{kitId}/assets"],
  ["GET", "/api/creator/brand-kits/{kitId}"],
  ["PATCH", "/api/creator/brand-kits/{kitId}"],
  ["DELETE", "/api/creator/brand-kits/{kitId}"],
  ["GET", "/api/creator/agent-assets"],
  ["POST", "/api/creator/agent-assets"],
  ["PATCH", "/api/creator/agent-assets/{assetId}"],
  ["DELETE", "/api/creator/agent-assets/{assetId}"],
  ["GET", "/api/creator/assets/library"],
  ["POST", "/api/creator/team-assets/upload"],
  ["POST", "/api/creator/team-assets/import-project-asset"],
  ["POST", "/api/creator/team-assets/{assetId}/upload"],
  ["PATCH", "/api/creator/team-assets/{assetId}"],
  ["DELETE", "/api/creator/team-assets/{assetId}"],
  ["PATCH", "/api/creator/assets/{assetId}"],
  ["DELETE", "/api/creator/assets/{assetId}"],
  ["POST", "/api/creator/assets/import"],
  ["POST", "/api/creator/uploads"],
  ["GET", "/api/creator/projects/{projectId}/members"],
  ["POST", "/api/creator/projects/{projectId}/members"],
  ["PATCH", "/api/creator/projects/{projectId}/members/{memberId}"],
  ["GET", "/api/creator/projects/{projectId}/team-dashboard/export"],
  ["GET", "/api/creator/projects/{projectId}/stats"],
  ["POST", "/api/creator/episodes"],
  ["PATCH", "/api/creator/episodes"],
  ["DELETE", "/api/creator/episodes"],
  ["GET", "/api/creator/assets/versions/{versionId}"],
  ["POST", "/api/creator/assets/confirm-all"],
  ["POST", "/api/creator/assets/confirm"],
  ["POST", "/api/creator/assets/update-label"],
  ["POST", "/api/creator/calibration/run"],
  ["POST", "/api/creator/calibration/skip"],
  ["POST", "/api/creator/calibration/override"],
  ["POST", "/api/creator/shots"],
  ["PATCH", "/api/creator/shots"],
  ["DELETE", "/api/creator/shots"],
  ["POST", "/api/creator/shots/reorder"],
  ["POST", "/api/creator/shots/{shotId}/media/import"],
  ["DELETE", "/api/creator/shots/{shotId}/media/{assetVersionId}"],
  ["DELETE", "/api/creator/shots/{shotId}/media"],
  ["POST", "/api/creator/shots/{shotId}/references"],
  ["POST", "/api/creator/shots/{shotId}/image/retry"],
  ["POST", "/api/creator/videos/generate"],
  ["POST", "/api/creator/shots/{shotId}/video/retry"],
  ["POST", "/api/creator/export/preview"],
  ["GET", "/api/creator/export/history"],
]);

// The official library is public when scope is absent or "official"; all other
// scopes continue through the existing user guard. Optional identity preserves
// that route-owned decision until query-aware policies are introduced.
const conditionalApiRouteAuthRegistrations = inventoryRegistrations("optional-user", [
  ["GET", "/api/creator/library/assets"],
]);

// These declarations currently sit inside a user-guard branch whose outer
// pathname predicate cannot be reached for either path. Deny records the
// effective behavior rather than making the dead handlers reachable.
const unreachableApiRouteAuthRegistrations = inventoryRegistrations("deny", [
  ["GET", "/api/dev-proxy/storyboard-video"],
  ["GET", "/api/batch-image-model-options"],
]);

export const apiRouteAuthRegistrations = [
  ...criticalApiRouteAuthRegistrations,
  ...adminApiRouteAuthRegistrations,
  ...userApiRouteAuthRegistrations,
  ...conditionalApiRouteAuthRegistrations,
  ...unreachableApiRouteAuthRegistrations,
] as const satisfies readonly RouteAuthRegistration[];

/**
 * Static source audit results. The test derives these counts from the entrypoint;
 * the 55 wide predicates and one query-conditional route are intentionally kept
 * partial until the registry can represent their exact runtime semantics.
 */
export const apiRouteAuthInventoryCoverage = {
  explicitMethodPath: { discovered: 165, uncovered: 0 },
  regexDynamicMatchers: { discovered: 115, uncovered: 0 },
  wideCompositePredicates: { unresolved: 55 },
  conditionalQueryPolicies: { unresolved: 1 },
  coverage: "partial" as const,
} as const;

export const criticalApiRouteAuthPolicyRegistry = new RouteAuthPolicyRegistry(
  apiRouteAuthRegistrations,
  { coverage: "partial" },
);
