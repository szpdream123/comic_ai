import { createHash } from "node:crypto";
import { ComicAiIntegrationHmacError, verifyComicAiIntegrationHmac } from "../../backend/src/modules/integrations/comic-ai-integration-hmac.ts";
import { ModelServiceError, type ModelConfig, type Operation, type ProviderExecutor, type RequestStore, type StoredRequest } from "./contracts.ts";
import { isObject, publicModel, readServiceConfig, reject, snapshotModel, validateIdentity, validatePayload } from "./policy.ts";

export const routePrefix = "/api/integrations/promo-agent";
const leaseMs = 180_000;
export const maxBodyBytes = 2 * 1024 * 1024;
export interface ServiceRequest { method: string; url: URL; headers: Record<string, string | string[] | undefined>; body: Buffer }
export interface ServiceResponse { status: number; body: Record<string, unknown> }

export function createModelService(deps: {
  store: RequestStore; executor: ProviderExecutor; listModels: () => Promise<ModelConfig[]>;
  env: NodeJS.ProcessEnv; now?: () => Date; pollIntervalMs?: number; maxTaskAgeMs?: number;
}) {
  const config = readServiceConfig(deps.env);
  const now = deps.now ?? (() => new Date());
  const interval = deps.pollIntervalMs ?? 10_000;
  const maxAge = deps.maxTaskAgeMs ?? 24 * 60 * 60 * 1000;
  function permitted(productId: string, model: ModelConfig, operation: Operation) {
    return config.products.get(productId)?.models[operation].includes(model.modelCode)
      && model.status === "active" && deps.executor.supports(model, operation)
      && (productId !== "promo-agent" || operation !== "video" ||
        (model.providerName.toLowerCase() === "globalaiopc" && ["globalaiopc_video", "global_ai_opc_video"].includes(model.providerProtocol)));
  }
  async function processOne(id?: string) {
    await deps.store.recoverExpired(now());
    const request = await deps.store.claim(now(), leaseMs, id);
    if (!request) return;
    const token = request.leaseToken!;
    // Heartbeats only extend this worker's lease. Finishing is fenced in SQL as well.
    let heartbeatFailure: unknown;
    let leaseLost = false;
    let renewing = Promise.resolve();
    const timer = setInterval(() => {
      renewing = renewing.then(async () => {
        if (!await deps.store.renew(request.id, token, now(), leaseMs)) leaseLost = true;
      }).catch(error => { heartbeatFailure = error; });
    }, leaseMs / 3);
    timer.unref();
    async function finish(update: Parameters<RequestStore["finish"]>[2]) {
      // Settle renewals before clearing the token so our own completion cannot look like lease loss.
      clearInterval(timer);
      await renewing;
      if (heartbeatFailure) throw heartbeatFailure;
      if (leaseLost) return false;
      return deps.store.finish(request!.id, token, update, now());
    }
    try {
      if (request.createdAt.getTime() + maxAge <= now().getTime()) {
        await finish({ status: request.externalId ? "result_unknown" : "failed", error: "request_deadline_exceeded", nextRunAt: now() });
        return;
      }
      if (!request.externalId) {
        // Recheck revocation before dispatch; a catalog update must not silently reroute an accepted request.
        const current = (await deps.listModels()).find(model => model.modelCode === request.model.modelCode);
        if (!current || !permitted(request.productId, current, request.operation)) {
          await finish({ status: "failed", error: "model_not_allowed", nextRunAt: now() });
          return;
        }
      }
      let outcome;
      try {
        outcome = request.externalId
          ? await deps.executor.poll(request.model, request.operation, request.payload, request.externalId, request.id)
          : await deps.executor.submit(request.model, request.operation, request.payload, request.id);
      } catch {
        await finish({ status: request.externalId ? "running" : "result_unknown",
          error: request.externalId ? "provider_poll_unavailable" : "provider_result_unknown",
          nextRunAt: new Date(now().getTime() + interval) });
        return;
      }
      if (outcome.status === "running" && !outcome.externalId && !request.externalId) {
        await finish({ status: "result_unknown", error: "provider_result_unknown", nextRunAt: now() });
        return;
      }
      try { validateJsonComplexity(outcome); }
      catch {
        await finish({ status: "result_unknown", error: "provider_result_invalid", nextRunAt: now() });
        return;
      }
      await finish({ ...outcome, externalId: outcome.externalId ?? request.externalId,
        error: outcome.error ?? null, nextRunAt: new Date(now().getTime() + interval) });
    } finally {
      clearInterval(timer); await renewing;
      if (heartbeatFailure) throw heartbeatFailure;
    }
  }
  async function handle(input: ServiceRequest): Promise<ServiceResponse> {
    try {
      if (input.body.length > maxBodyBytes) throw new ModelServiceError(413, "body_too_large");
      if (!input.url.pathname.startsWith(routePrefix + "/")) throw new ModelServiceError(404, "route_not_found");
      const identity = verifyComicAiIntegrationHmac({ env: { COMIC_AI_INTEGRATION_HMAC_KEYS_JSON: config.hmacKeys },
        method: input.method, pathWithQuery: input.url.pathname + input.url.search, headers: input.headers, body: input.body, now: now() });
      if (!await deps.store.rememberNonce(identity.workerId, identity.keyId, identity.nonce, new Date(now().getTime() + 600_000), now())) {
        throw new ModelServiceError(409, "request_nonce_replayed");
      }
      const productId = identity.workerId;
      const policy = config.products.get(productId);
      if (!policy) throw new ModelServiceError(403, "product_not_allowed");
      const path = input.url.pathname.slice(routePrefix.length);
      if (input.method === "GET" && ["/models", "/text-models"].includes(path)) {
        const kind = path === "/text-models" ? "text" : input.url.searchParams.get("operation") ?? "video";
        if (!["text", "video", "speech", "transcription"].includes(kind)) reject("operation_invalid");
        const operation = kind as Operation;
        const models = (await deps.listModels()).filter(model => permitted(productId, model, operation));
        return { status: 200, body: { models: models.map(model => publicModel(model, operation)) } };
      }
      const match = path.match(/^\/(requests|video-generations)\/([0-9a-f-]{36})$/i);
      if (input.method === "GET" && match) {
        const subjectId = input.url.searchParams.get("subjectId");
        if (!subjectId || subjectId.length > 160 || !storableString(subjectId)) reject("subject_id_required");
        const request = await deps.store.get(match[2], productId, subjectId);
        if (!request || (match[1] === "video-generations" && request.operation !== "video")) throw new ModelServiceError(404, "resource_not_found");
        return { status: 200, body: publicRequest(request) };
      }
      if (input.method !== "POST" || !["/text-completions", "/video-generations", "/audio-generations"].includes(path)) throw new ModelServiceError(404, "route_not_found");
      let body: Record<string, unknown>;
      try { body = JSON.parse(input.body.toString("utf8")); } catch { reject("invalid_json"); }
      if (!isObject(body)) reject("invalid_json");
      validateJsonComplexity(body);
      validateIdentity(body, input.headers["idempotency-key"]);
      const operation: Operation = path === "/text-completions" ? "text" : path === "/video-generations" ? "video"
        : body.operation === "speech" || body.operation === "transcription" ? body.operation : reject("audio_operation_required");
      const requestHash = createHash("sha256").update(JSON.stringify(canonical({ operation, body }))).digest("hex");
      // Look up accepted work before current catalog checks: disabling a model must not hide its result.
      const existing = await deps.store.findByKey(productId, body.subjectId as string, body.requestKey as string);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ModelServiceError(409, "idempotency_conflict");
        return submissionResponse(existing);
      }
      const models = await deps.listModels();
      const model = models.find(model => model.modelCode === body.model);
      if (!model || !policy.models[operation].includes(model.modelCode)) throw new ModelServiceError(403, "model_not_allowed");
      if (!deps.executor.supports(model, operation)) throw new ModelServiceError(422, "model_capability_unsupported");
      if (!permitted(productId, model, operation)) throw new ModelServiceError(403, "model_not_allowed");
      const payload = validatePayload(body, operation, model, policy);
      const created = await deps.store.create({ productId, subjectId: body.subjectId as string, requestKey: body.requestKey as string,
        requestHash, operation, model: snapshotModel(model), payload }, now());
      if (operation === "text" && created.created) await processOne(created.request.id);
      return submissionResponse((await deps.store.get(created.request.id, productId, body.subjectId as string))!);
    } catch (error) {
      if (error instanceof ModelServiceError || error instanceof ComicAiIntegrationHmacError) {
        return { status: error.status, body: { error: error.code, message: error.code } };
      }
      throw error;
    }
  }
  return { handle, tick: () => processOne() };
}
function submissionResponse(request: StoredRequest): ServiceResponse {
  return { status: ["succeeded", "failed"].includes(request.status) ? 200 : 202, body: publicRequest(request) };
}
function publicRequest(request: StoredRequest): Record<string, unknown> {
  return { requestId: request.id, ...(request.operation === "video" ? { taskId: request.id } : {}),
    model: request.model.modelCode, modelCode: request.model.modelCode, operation: request.operation,
    status: request.status, ...(request.result ?? { usage: null }),
    ...(request.error ? { error: request.error } : {}) };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function validateJsonComplexity(value: unknown) {
  const pending = [{ value, depth: 0 }]; let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > 50_000 || current.depth > 32) reject("body_too_complex");
    if (typeof current.value === "string" && !storableString(current.value)) reject("json_string_invalid");
    if (current.value && typeof current.value === "object") {
      for (const [key, child] of Object.entries(current.value)) {
        if (!storableString(key)) reject("json_string_invalid");
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}
function storableString(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
