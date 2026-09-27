import { createHash } from "node:crypto";
import type { SqlDatabase } from "../shared/db/sql.ts";
import type { AiModelConfigRecord } from "../model-catalog/ai-model-config.store.ts";
import { listActiveAiModelConfigs } from "../model-catalog/ai-model-config.store.ts";
import { GenerationModelRequestValidationError } from "../model-catalog/generation-model-request.validator.ts";
import { adaptGenerationPrompt } from "../model-catalog/generation-prompt-adaptation.ts";
import { composeGenerationPrompt, generationPromptExceedsLimit, measureGenerationPrompt, resolveGenerationPromptLimit } from "../../../../web/src/shared/generation-prompt-policy.js";
import { createTextModelChatGateway, type TextChatGatewayLike } from "../ai-storyboard/ai-storyboard-preview.service.ts";
import { AdminBackedTextModelResolver } from "../canvas-agent/admin-backed-text-model.resolver.ts";
import { OpenAICompatibleTextAdapter } from "./openai-compatible-text.adapter.ts";
import { ModelflareResponsesAdapter } from "./modelflare-responses.adapter.ts";
import { TextModelGatewayService } from "./text-model-gateway.service.ts";
import { createOrReuseProviderRequest, markProviderRequestFailed, markProviderRequestSucceeded } from "./provider-request.service.ts";
import { createUserModelRequestLog, completeUserModelRequestLog } from "./user-model-request-log.service.ts";
import { buildSanBaoImagePayload, buildSanBaoVideoPayload } from "./san-bao.provider-adapter.ts";

// Preparation is outside the generation/credit transaction. The unique request
// key claims one user-requested simplification. Ordinary generation only
// validates; it must never apply even a previously cached suggestion.
export async function prepareGenerationPrompt(db: SqlDatabase, input: {
  model: AiModelConfigRecord;
  prompt: string;
  parameters?: Record<string, unknown>;
  firstFrameUrl?: string | null;
  userId: string;
  projectId?: string | null;
  canvasProjectId?: string | null;
  requestKey: string;
  env: NodeJS.ProcessEnv;
  now: Date;
  complete?: TextChatGatewayLike["completeJson"];
  allowRewrite?: boolean;
}) {
  const allowRewrite = input.allowRewrite === true;
  const limit = resolveGenerationPromptLimit(input.model);
  // Only the simplification route supplies this server-resolved composition.
  // Generation already contains the composed prompt and must not append twice.
  const normalize = (prompt: string) => normalizeProviderPrompt(input.model,
    allowRewrite ? composeGenerationPrompt(prompt, input.parameters?.promptComposition) : prompt,
    input.parameters, input.firstFrameUrl);
  const executionPrompt = normalize(input.prompt);
  if (!generationPromptExceedsLimit(executionPrompt, limit)
    && (!allowRewrite || !generationPromptExceedsLimit(input.prompt, limit))) {
    // Keep mention boundaries until the adapter collects and tags references.
    // A second pass over unwrapped mentions can lose bindings next to Chinese text.
    const prompt = input.prompt;
    return { prompt, originalPrompt: input.prompt, method: prompt === input.prompt ? "unchanged" : "provider_normalized" };
  }
  const hash = createHash("sha256").update(JSON.stringify({ prompt: input.prompt, executionPrompt, limit,
    intent: allowRewrite ? "editable_suggestion_v1" : "generation_validation",
    model: input.model.modelCode, projectId: input.projectId ?? null, canvasProjectId: input.canvasProjectId ?? null,
  })).digest("hex");
  const requestKey = `${allowRewrite ? "prompt-preparation" : "prompt-validation"}:${input.userId}:${input.requestKey}:${hash}`;
  const localStage = allowRewrite ? "prompt_preparation" : "prompt_validation";
  const audit = {
    model: input.model.modelCode, originalPrompt: input.prompt,
    localStage, limit,
    actualLength: measureGenerationPrompt(executionPrompt, limit),
    externalSubmissionStartedAt: null,
  };
  const prepared = await createOrReuseProviderRequest(db, {
    userId: input.userId, projectId: input.projectId, canvasProjectId: input.canvasProjectId,
    providerName: input.model.providerName, providerOperation: `${input.model.mediaType}.prompt.${allowRewrite ? "adaptation" : "validation"}`,
    requestKey, requestHash: hash, payloadHash: hash, payloadRef: `prompt-preparation://${hash}`,
    redactedPayload: audit, now: input.now,
  });
  // Upsert also repairs a display-log insert interrupted after claiming the key.
  await createUserModelRequestLog(db, {
    providerRequestId: prepared.request.id, userId: input.userId,
    projectId: input.projectId, canvasProjectId: input.canvasProjectId,
    providerName: input.model.providerName, providerOperation: prepared.request.providerOperation,
    modelId: input.model.modelCode, providerModel: input.model.providerModel,
    requestKey, requestHash: hash, payloadHash: hash,
    requestFormat: allowRewrite ? "generation_prompt_adaptation" : "generation_prompt_validation", requestBody: audit,
    payloadSummary: allowRewrite ? "用户主动精简提示词（免费）；尚未发送生成模型" : "本地长度校验；尚未发送模型；不扣用户积分", now: input.now,
  });
  if (prepared.kind === "reused") {
    const result = prepared.request.redactedResponse?.promptAdaptation as Record<string, unknown> | undefined;
    if (allowRewrite && prepared.request.status === "succeeded" && typeof result?.prompt === "string"
      && result.originalPrompt === input.prompt && !generationPromptExceedsLimit(normalize(result.prompt), limit)
      && !generationPromptExceedsLimit(result.prompt, limit)) {
      await completeUserModelRequestLog(db, { providerRequestId: prepared.request.id, status: "succeeded",
        responseText: JSON.stringify({ ...result, limit }), now: new Date() });
      return { prompt: result.prompt, originalPrompt: input.prompt, method: "model_adapted" };
    }
    if (prepared.request.status === "created") {
      if (Date.now() - prepared.request.createdAt.getTime() > 120_000) {
        // A crashed preparation must not leave this request permanently "running".
        await markProviderRequestFailed(db, { providerRequestId: prepared.request.id,
          failureCode: "model_prompt_too_long", redactedResponse: { ...audit, adaptationReason: "preparation_expired" }, now: new Date() });
        await completeUserModelRequestLog(db, { providerRequestId: prepared.request.id, status: "failed",
          failureCode: "model_prompt_too_long", responseText: "提示词适配中断，原稿已保留，请重新发起生成。", now: new Date() });
        throw new GenerationModelRequestValidationError("model_prompt_too_long", "提示词适配中断，原稿已保留，请重新发起生成。");
      }
      throw new GenerationModelRequestValidationError("model_prompt_adaptation_pending", "提示词正在适配，请稍后重试；原稿已保留。");
    }
    if (prepared.request.status === "failed") {
      await completeUserModelRequestLog(db, { providerRequestId: prepared.request.id, status: "failed",
        failureCode: "model_prompt_too_long", responseText: JSON.stringify(prepared.request.redactedResponse), now: new Date() });
    }
    throw new GenerationModelRequestValidationError("model_prompt_too_long", allowRewrite
      ? "提示词精简未完成，原稿已保留，请手动修改或选择其他模型。"
      : "提示词超过当前模型上限，请点击「AI 精简提示词」或手动修改后再生成。");
  }
  let result: Awaited<ReturnType<typeof adaptGenerationPrompt>>;
  try {
    if (!allowRewrite) {
      throw Object.assign(new GenerationModelRequestValidationError("model_prompt_too_long",
        input.model.mediaType === "audio" ? "朗读文本超过当前模型上限，请分段后生成。"
          : "提示词超过当前模型上限，请点击「AI 精简提示词」或手动修改后再生成。"), { adaptationReason: "user_action_required" });
    }
    let complete = input.complete;
    if (!complete && input.model.mediaType !== "audio") {
      const models = await listActiveAiModelConfigs(db, { mediaType: "text" });
      const textModel = models.find((model) => model.invocationMode === "stream"
        && ["openai_compatible_chat", "cumob_chat", "modelflare_responses"].includes(model.providerProtocol));
      if (!textModel) throw new Error("prompt_adaptation_text_model_unavailable");
      const gateway = createTextModelChatGateway({
        gateway: new TextModelGatewayService({ db, env: input.env,
          adapter: new OpenAICompatibleTextAdapter(), modelflareAdapter: new ModelflareResponsesAdapter(),
          resolver: new AdminBackedTextModelResolver(db, { requireAgentCompatibility: false }),
        }), disableThinking: true,
      });
      complete = (request) => gateway.completeJson({
        ...request, model: textModel.modelCode, createdByUserId: input.userId,
        projectId: input.projectId, canvasProjectId: input.canvasProjectId,
        payloadSummary: "用户主动精简提示词（免费）", requestKeyPrefix: requestKey,
      });
    }
    const adapted = await adaptGenerationPrompt({ model: input.model, prompt: input.prompt, normalize,
      complete: complete ?? (async () => { throw new Error("prompt_adaptation_unavailable"); }),
    });
    result = { ...adapted, originalPrompt: input.prompt };
  } catch (error) {
    const reason = error instanceof GenerationModelRequestValidationError
      ? (error as Error & { adaptationReason?: string }).adaptationReason ?? "validation_failed"
      : "adaptation_unavailable";
    await markProviderRequestFailed(db, { providerRequestId: prepared.request.id,
      failureCode: "model_prompt_too_long", redactedResponse: { ...audit, adaptationReason: reason }, now: new Date(),
    });
    await completeUserModelRequestLog(db, { providerRequestId: prepared.request.id, status: "failed",
      failureCode: "model_prompt_too_long", responseText: JSON.stringify({ localStage, reason, limit }), now: new Date(),
    });
    throw error instanceof GenerationModelRequestValidationError ? error
      : new GenerationModelRequestValidationError("model_prompt_too_long", "暂时无法完成提示词适配，原稿已保留，请稍后重试。");
  }
  // Persistence errors are not model failures; never attempt to turn a saved
  // successful preparation into failed if updating the display log fails.
  await markProviderRequestSucceeded(db, {
    providerRequestId: prepared.request.id, externalRequestId: null,
    redactedResponse: { promptAdaptation: result, limit, localStage: "prompt_preparation" }, now: new Date(),
  });
  await completeUserModelRequestLog(db, { providerRequestId: prepared.request.id, status: "succeeded",
    responseText: JSON.stringify({ ...result, limit }), now: new Date(),
  });
  return result;
}

// These builders also perform the provider's final reference-tag substitution.
// Reuse them before budgeting so a long custom tag cannot overflow after validation.
export function measurePreparedGenerationPrompt(model: AiModelConfigRecord, prompt: string, parameters: Record<string, unknown>, firstFrameUrl?: string | null) {
  const limit = resolveGenerationPromptLimit(model);
  const finalPrompt = normalizeProviderPrompt(model, composeGenerationPrompt(prompt, parameters.promptComposition), parameters, firstFrameUrl);
  const length = measureGenerationPrompt(finalPrompt, limit);
  const originalLength = measureGenerationPrompt(prompt, limit);
  return { length, additionalLength: length === null || originalLength === null ? 0 : length - originalLength };
}

export function normalizeProviderPrompt(model: AiModelConfigRecord, prompt: string, parameters: Record<string, unknown> = {}, firstFrameUrl?: string | null) {
  if (model.providerProtocol !== "san_bao" || !["image", "video"].includes(model.mediaType)) return prompt;
  const submission = { providerRequestId: "prompt-preparation", providerName: model.providerName,
    providerOperation: `${model.mediaType}.generate`, requestKey: "prompt-preparation", payloadRef: "prompt-preparation", payloadHash: "",
    redactedPayload: { prompt, parameters, firstFrameUrl },
  };
  const body = model.mediaType === "image" ? buildSanBaoImagePayload(submission) : buildSanBaoVideoPayload(submission);
  return typeof body.prompt === "string" ? body.prompt : prompt;
}
