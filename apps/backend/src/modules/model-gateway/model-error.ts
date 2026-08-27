export type ModelErrorPhase =
  | "prepare"
  | "reference_fetch"
  | "submit"
  | "poll"
  | "stream"
  | "artifact_download"
  | "persist";

export type ModelErrorMediaType = "text" | "image" | "video" | "audio";

export interface ModelErrorContext {
  failureCode?: string | null;
  fallbackMessage?: string | null;
  mediaType?: ModelErrorMediaType | null;
  phase?: ModelErrorPhase | null;
  providerDiagnostics?: Record<string, unknown> | null;
}

interface ModelErrorRule {
  code: string;
  displayMessage: string;
  retryable: boolean;
  pattern: RegExp;
}

const MODEL_ERROR_RESPONSE_CANDIDATE_KEYS = [
  "providerRawResponse",
  "responseBodyPreview",
  "responseBody",
  "body",
  "providerDiagnostics",
  "diagnostics",
  "providerResponse",
  "response",
  "snapshotFailure",
  "failure",
  "data",
  "value",
  "error",
  "errors",
  "providerMessage",
  "errorMessage",
  "message",
  "reason",
  "displayMessage",
  "details",
  "providerErrorCode",
  "errorCode",
  "code",
  "failureCode",
  "statusText",
] as const;

const stableModelErrors: Readonly<Record<string, Omit<ModelErrorRule, "pattern">>> = {
  model_not_configured: {
    code: "model_not_configured",
    displayMessage: "模型不可用，请切换模型。",
    retryable: false,
  },
  model_disabled: {
    code: "model_disabled",
    displayMessage: "当前模型维护中，请切换模型。",
    retryable: false,
  },
  model_provider_unsupported: {
    code: "model_provider_unsupported",
    displayMessage: "当前模型暂未接入生成执行器，请切换已支持的模型。",
    retryable: false,
  },
  model_task_mode_unsupported: {
    code: "model_task_mode_unsupported",
    displayMessage: "当前模型不支持该生成方式。",
    retryable: false,
  },
  model_reference_limit_exceeded: {
    code: "model_reference_limit_exceeded",
    displayMessage: "参考素材数量超出模型限制。",
    retryable: false,
  },
  model_reference_media_required: {
    code: "model_reference_media_required",
    displayMessage: "模型需要上传至少一个参考素材，请上传后重试。",
    retryable: false,
  },
  model_reference_not_found: {
    code: "model_reference_not_found",
    displayMessage: "参考素材不存在或无权访问。",
    retryable: false,
  },
  model_reference_unavailable: {
    code: "model_reference_unavailable",
    displayMessage: "参考素材尚未准备好，请重新选择。",
    retryable: false,
  },
  model_reference_mime_not_allowed: {
    code: "model_reference_mime_not_allowed",
    displayMessage: "当前模型不支持该参考素材格式。",
    retryable: false,
  },
  model_reference_too_large: {
    code: "model_reference_too_large",
    displayMessage: "参考素材不可大于20M",
    retryable: false,
  },
  model_real_person_detected: {
    code: "model_real_person_detected",
    displayMessage: "素材包含真人信息，请修改后再试",
    retryable: false,
  },
  model_service_overloaded: {
    code: "model_service_overloaded",
    displayMessage: "模型负载过高，请更换模型再试",
    retryable: false,
  },
  model_prompt_too_long: {
    code: "model_prompt_too_long",
    displayMessage: "提示词过长，请缩短后重试。",
    retryable: false,
  },
  model_parameter_invalid: {
    code: "model_parameter_invalid",
    displayMessage: "模型参数不合法，请重新选择后再试。",
    retryable: false,
  },
  provider_api_key_env_required: {
    code: "provider_api_key_env_required",
    displayMessage: "模型服务密钥配置缺失，请联系管理员检查模型配置。",
    retryable: false,
  },
  provider_api_key_missing: {
    code: "provider_api_key_missing",
    displayMessage: "模型服务密钥配置缺失，请联系管理员检查模型配置。",
    retryable: false,
  },
  provider_adapter_missing: {
    code: "provider_adapter_missing",
    displayMessage: "模型服务执行器未配置，请联系管理员处理。",
    retryable: false,
  },
  san_bao_bad_request: {
    code: "san_bao_bad_request",
    displayMessage: "三宝影像请求参数不符合模型要求，请检查提示词、比例和参考素材。",
    retryable: false,
  },
  san_bao_authentication_failed: {
    code: "san_bao_authentication_failed",
    displayMessage: "三宝影像鉴权失败，请联系管理员检查 API 密钥。",
    retryable: false,
  },
  san_bao_insufficient_balance: {
    code: "san_bao_insufficient_balance",
    displayMessage: "三宝影像账户积分不足，请联系管理员充值后重试。",
    retryable: false,
  },
  san_bao_account_restricted: {
    code: "san_bao_account_restricted",
    displayMessage: "三宝影像账户当前受限，请联系管理员处理。",
    retryable: false,
  },
  san_bao_payload_too_large: {
    code: "san_bao_payload_too_large",
    displayMessage: "参考素材不可大于20M",
    retryable: false,
  },
  san_bao_rate_limited: {
    code: "san_bao_rate_limited",
    displayMessage: "三宝影像请求过于频繁，请稍后重试。",
    retryable: true,
  },
  san_bao_service_unavailable: {
    code: "san_bao_service_unavailable",
    displayMessage: "三宝影像模型服务暂不可用，请稍后重试。",
    retryable: true,
  },
  san_bao_network_error: {
    code: "san_bao_network_error",
    displayMessage: "无法连接三宝影像服务，请稍后重试。",
    retryable: true,
  },
  san_bao_invalid_response: {
    code: "san_bao_invalid_response",
    displayMessage: "三宝影像返回结果异常，请稍后重试。",
    retryable: true,
  },
  san_bao_artifact_url_invalid: {
    code: "san_bao_artifact_url_invalid",
    displayMessage: "三宝影像返回的生成链接无效，请稍后重试。",
    retryable: true,
  },
  san_bao_provider_failed: {
    code: "san_bao_provider_failed",
    displayMessage: "三宝影像生成失败，请调整参数或稍后重试。",
    retryable: true,
  },
  provider_circuit_open: {
    code: "provider_circuit_open",
    displayMessage: "模型服务暂时不可用，请稍后重试。",
    retryable: true,
  },
  provider_submission_prepare_failed: {
    code: "provider_submission_prepare_failed",
    displayMessage: "生成请求发送前准备失败，请稍后重试。",
    retryable: true,
  },
  provider_submission_ambiguous: {
    code: "provider_submission_ambiguous",
    displayMessage: "模型请求已发出，但处理状态暂不明确，请等待后台复核。",
    retryable: false,
  },
  provider_poll_timeout: {
    code: "provider_poll_timeout",
    displayMessage: "生成超时，请重新处理生成。",
    retryable: false,
  },
  provider_result_unknown: {
    code: "provider_result_unknown",
    displayMessage: "生成结果状态不明确，请稍后查看任务状态。",
    retryable: false,
  },
  provider_output_download_failed: {
    code: "provider_output_download_failed",
    displayMessage: "存储超时，正在重试。",
    retryable: true,
  },
  provider_output_upload_failed: {
    code: "provider_output_upload_failed",
    displayMessage: "存储超时，正在重试。",
    retryable: true,
  },
  provider_output_storage_failed: {
    code: "provider_output_storage_failed",
    displayMessage: "存储失败，等待人工处理。",
    retryable: false,
  },
  provider_output_persist_failed: {
    code: "provider_output_persist_failed",
    displayMessage: "生成结果保存失败，等待后台处理。",
    retryable: false,
  },
};

const modelErrorRules: readonly ModelErrorRule[] = [
  {
    code: "model_reference_url_not_public",
    displayMessage: "本地图片无法解析，请上传公网图片。",
    retryable: false,
    pattern: /(?:image[_\s-]?url|image url).*(?:publicly reachable|public (?:http|https)|https? url)|publicly reachable.*https?\s*(?:or|\/)\s*https?\s*url/i,
  },
  {
    code: "model_reference_too_large",
    displayMessage: "参考素材不可大于20M",
    retryable: false,
    pattern: /image_provider_reference_too_large|file\s+size\s+exceeds?\s+(?:the\s+)?maximum\s+allowed\s+size|maximum\s+allowed\s+size\s+of\s+\d+\s*bytes|file\s+too\s+large|文件大小.*(?:超过|超出)|参考素材.*(?:过大|超限)/i,
  },
  {
    code: "model_reference_media_required",
    displayMessage: "模型需要上传至少一个参考素材，请上传后重试。",
    retryable: false,
    pattern: /requires?\s+(?:(?:at\s+least\s+)?(?:one|1)\s+)?(?:a\s+)?media\b|media\s+(?:is\s+)?required|参考素材.*(?:至少|需要).*(?:上传|提供)/i,
  },
  {
    code: "model_real_person_detected",
    displayMessage: "素材包含真人信息，请修改后再试",
    retryable: false,
    pattern: /may contain (?:a |an )?real person|real person detected|真人信息/i,
  },
  {
    code: "model_content_policy_rejected",
    displayMessage: "参考图或提示词不符合内容安全策略，请调整素材或提示词后重试。",
    retryable: false,
    pattern: /first frame.*violates|content policy|safety|moderation|policy/i,
  },
  {
    code: "model_authentication_failed",
    displayMessage: "模型服务鉴权失败，请检查 API 密钥和账号权限。",
    retryable: false,
    pattern: /AuthenticationError|\bUnauthorized\b|API key.*(?:incorrect|invalid)|invalid.*API key/i,
  },
  {
    code: "model_response_truncated",
    displayMessage: "模型服务响应为空或被截断，后端没有拿到完整结果。",
    retryable: true,
    pattern: /Unexpected end of JSON input/i,
  },
  {
    code: "model_artifact_transfer_interrupted",
    displayMessage: "模型产物传输中断，请稍后重试。",
    retryable: true,
    pattern: /aborted|stream aborted|stream.*closed/i,
  },
  {
    code: "model_request_content_missing",
    displayMessage: "请求内容缺失，请检查提示词和参考素材后重试。",
    retryable: false,
    pattern: /content field is required/i,
  },
  {
    code: "model_not_available",
    displayMessage: "当前模型不可用或账号没有权限，请检查模型配置和账号权限后重试。",
    retryable: false,
    pattern: /cannot access|does not exist|do not have access|not found.*model|endpoint.*not found/i,
  },
  {
    code: "model_input_limit_exceeded",
    displayMessage: "参考素材或参数数量超过模型限制，请减少素材数量后重试。",
    retryable: false,
    pattern: /cannot exceed|too many (?:images?|items?|references?|inputs?)|exceed.*item|(?:reference|input).*limit exceeded/i,
  },
  {
    code: "model_request_unsupported",
    displayMessage: "当前模型不支持这个参数或请求方式，请调整模型参数后重试。",
    retryable: false,
    pattern: /not supported by the current model|unsupported.*current model|unsupported request/i,
  },
  {
    code: "model_duration_invalid",
    displayMessage: "生成时长参数不合法，请检查生成时长后重试。",
    retryable: false,
    pattern: /duration.*integer.*least|duration.*invalid/i,
  },
  {
    code: "model_result_not_found",
    displayMessage: "模型服务结果已不存在，系统已停止继续轮询，请重新发起生成。",
    retryable: false,
    pattern: /ResourceNotFound|specified resource.*not found|task.*not found/i,
  },
  {
    code: "model_service_overloaded",
    displayMessage: "模型负载过高，请更换模型再试",
    retryable: false,
    pattern: /system\s+under\s+load|under\s+load|model\s+overloaded/i,
  },
  {
    code: "model_service_unavailable",
    displayMessage: "模型服务繁忙或暂时不可用，请稍后重试。",
    retryable: true,
    pattern: /upstream overloaded|Service Unavailable|temporarily_unavailable/i,
  },
  {
    code: "model_empty_response",
    displayMessage: "模型服务响应为空，请稍后重试。",
    retryable: true,
    pattern: /empty_response/i,
  },
  {
    code: "model_invalid_json",
    displayMessage: "模型服务响应格式异常，后端无法解析结果。",
    retryable: true,
    pattern: /invalid_json/i,
  },
  {
    code: "model_invalid_response",
    displayMessage: "模型服务响应中没有可用的生成结果。",
    retryable: true,
    pattern: /invalid_response/i,
  },
  {
    code: "model_timeout",
    displayMessage: "模型服务响应超时，请稍后重试。",
    retryable: true,
    pattern: /timeout|timed out/i,
  },
  {
    code: "model_network_error",
    displayMessage: "渠道参考内容无法解析、请更换渠道。",
    retryable: true,
    pattern: /fetch failed|socket closed|connection.*closed|ECONNRESET|ETIMEDOUT|network/i,
  },
  {
    code: "model_provider_failed",
    displayMessage: "模型服务返回失败，任务没有拿到生成结果，请稍后重试。",
    retryable: true,
    pattern: /generation failed|provider failed|api error/i,
  },
];

export class ModelError extends Error {
  readonly code: string;
  readonly displayMessage: string;
  readonly failureCode: string | null;
  readonly httpStatus: number | null;
  readonly mediaType: ModelErrorMediaType | null;
  readonly phase: ModelErrorPhase | null;
  readonly providerDiagnostics: Record<string, unknown> | null;
  readonly providerErrorCode: string | null;
  readonly providerMessage: string | null;
  readonly requestId: string | null;
  readonly retryable: boolean;

  private constructor(input: {
    code: string;
    displayMessage: string;
    failureCode: string | null;
    httpStatus: number | null;
    mediaType: ModelErrorMediaType | null;
    message: string;
    phase: ModelErrorPhase | null;
    providerDiagnostics: Record<string, unknown> | null;
    providerErrorCode: string | null;
    providerMessage: string | null;
    requestId: string | null;
    retryable: boolean;
  }) {
    super(input.message || input.displayMessage);
    this.name = "ModelError";
    this.code = input.code;
    this.displayMessage = input.displayMessage;
    this.failureCode = input.failureCode;
    this.httpStatus = input.httpStatus;
    this.mediaType = input.mediaType;
    this.phase = input.phase;
    this.providerDiagnostics = input.providerDiagnostics;
    this.providerErrorCode = input.providerErrorCode;
    this.providerMessage = input.providerMessage;
    this.requestId = input.requestId;
    this.retryable = input.retryable;
  }

  static fromUnknown(value: unknown, context: ModelErrorContext = {}): ModelError {
    if (value instanceof ModelError && !hasModelErrorContext(context)) {
      return value;
    }
    const providerDiagnostics = context.providerDiagnostics ?? readRecordField(value, "providerDiagnostics", "diagnostics");
    const candidates = collectModelErrorCandidates({
      providerDiagnostics,
      value,
    });
    const rule = candidates
      .map((candidate) => modelErrorRules.find((item) => item.pattern.test(candidate)))
      .find(Boolean) ?? null;
    const httpStatus = readHttpStatus(providerDiagnostics, candidates, value);
    const failureCode = readFirstString(
      context.failureCode,
      readObjectString(value, "failureCode"),
    ) || null;
    const stableError = failureCode ? stableModelErrors[failureCode] ?? null : null;
    const fallbackDisplayMessage = context.mediaType === "video"
      ? "生成失败，请修改素材或提示词后重新生成"
      : "模型服务返回错误，任务没有拿到生成结果，请稍后重试。";
    const displayMessage =
      stableError?.displayMessage ??
      rule?.displayMessage ??
      resolveHttpStatusDisplayMessage(httpStatus) ??
      readFirstPublicChineseMessage(candidates) ??
      String(context.fallbackMessage ?? "").trim() ??
      fallbackDisplayMessage;
    const normalizedDisplayMessage = context.mediaType === "video" && displayMessage.includes("没有拿到生成结果")
      ? fallbackDisplayMessage
      : displayMessage;
    const providerMessage = readProviderMessage(candidates, value);
    const providerErrorCode = readProviderErrorCode(value, providerDiagnostics);
    const code = stableError?.code ?? rule?.code ?? failureCode ?? (readObjectString(value, "code") || "model_provider_error");
    const sourceMessage = readSourceMessage(value) || failureCode || code;
    return new ModelError({
      code,
      displayMessage: normalizedDisplayMessage || fallbackDisplayMessage,
      failureCode,
      httpStatus,
      mediaType: context.mediaType ?? null,
      message: sourceMessage,
      phase: context.phase ?? null,
      providerDiagnostics,
      providerErrorCode,
      providerMessage,
      requestId: readFirstString(
        readObjectString(providerDiagnostics, "requestId"),
        readObjectString(providerDiagnostics, "request_id"),
        readObjectString(value, "requestId"),
        readObjectString(value, "request_id"),
        readObjectString(readRecordField(value, "response"), "requestId"),
        readObjectString(readRecordField(value, "response"), "request_id"),
      ) || null,
      retryable: stableError?.retryable ?? rule?.retryable ?? isRetryableHttpStatus(httpStatus),
    });
  }

  static displayMessage(value: unknown, context: ModelErrorContext = {}): string {
    if (isEmptyModelErrorValue(value)) {
      return String(context.fallbackMessage ?? "").trim();
    }
    return ModelError.fromUnknown(value, context).displayMessage;
  }

  toFailureRecord(): Record<string, unknown> {
    return removeUndefined({
      code: this.code,
      failureCode: this.failureCode,
      displayMessage: this.displayMessage,
      providerErrorCode: this.providerErrorCode,
      providerMessage: this.displayMessage,
      details: publicModelErrorDetails(this.providerDiagnostics),
    });
  }

  toRedactedProviderRecord(): Record<string, unknown> {
    return removeUndefined({
      displayMessage: this.displayMessage,
      errorCode: this.code,
      failureCode: this.failureCode,
      providerErrorCode: this.providerErrorCode,
      providerMessage: this.displayMessage,
      diagnostics: this.providerDiagnostics,
    });
  }
}

function collectModelErrorCandidates(value: unknown): string[] {
  const candidates: string[] = [];
  const seenStrings = new Set<string>();
  const seenObjects = new WeakSet<object>();
  const visit = (entry: unknown, depth: number) => {
    if (depth > 6 || candidates.length >= 80 || entry === null || entry === undefined) return;
    if (typeof entry === "string") {
      const text = entry.trim();
      if (!text) return;
      if (/^[\[{]/.test(text)) {
        try {
          visit(JSON.parse(text), depth + 1);
        } catch {
          // The provider may prefix JSON with a failure code; retain the full text for rule matching.
        }
      }
      if (!seenStrings.has(text)) {
        seenStrings.add(text);
        candidates.push(text);
      }
      return;
    }
    if (typeof entry !== "object") return;
    if (seenObjects.has(entry)) return;
    seenObjects.add(entry);
    const record = entry as Record<string, unknown>;
    for (const key of MODEL_ERROR_RESPONSE_CANDIDATE_KEYS) {
      if (key in record) visit(record[key], depth + 1);
    }
  };
  visit(value, 0);
  return candidates;
}

function readProviderMessage(candidates: string[], value: unknown): string | null {
  const explicit = readFirstString(
    readObjectString(value, "providerMessage"),
    readObjectString(value, "errorMessage"),
  );
  if (explicit) return explicit;
  return candidates.find((candidate) => (
    !/^[a-z0-9_:-]+$/i.test(candidate) &&
    !/^[\[{]/.test(candidate) &&
    candidate.length <= 1000
  )) ?? null;
}

function readProviderErrorCode(value: unknown, diagnostics: Record<string, unknown> | null): string | null {
  for (const record of [value, diagnostics]) {
    const code = readFirstString(
      readObjectString(record, "providerErrorCode"),
      readObjectString(record, "errorCode"),
    );
    if (code) return code;
  }
  const candidates = collectModelErrorCandidates({ diagnostics, value });
  return candidates.find((candidate) => /^[a-z][a-z0-9_.:-]{2,80}$/i.test(candidate)) ?? null;
}

function readHttpStatus(
  diagnostics: Record<string, unknown> | null,
  candidates: string[],
  value: unknown,
): number | null {
  const response = readRecordField(value, "response");
  for (const candidate of [
    diagnostics?.httpStatus,
    diagnostics?.status,
    readObjectValue(value, "status"),
    readObjectValue(value, "statusCode"),
    readObjectValue(response, "status"),
    readObjectValue(response, "statusCode"),
  ]) {
    const explicit = Number(candidate);
    if (Number.isInteger(explicit) && explicit >= 100 && explicit <= 599) return explicit;
  }
  for (const candidate of candidates) {
    const matched = /\bHTTP\s*(\d{3})\b/i.exec(candidate)?.[1] ??
      /(?:image_provider|video_provider|provider_artifact_download|provider_artifact_upload|cumob_image|openai_images)_(\d{3})/i.exec(candidate)?.[1];
    const parsed = Number(matched);
    if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) return parsed;
  }
  return null;
}

function resolveHttpStatusDisplayMessage(status: number | null): string | null {
  if (status === 400) return "模型服务拒绝了请求，请检查提示词、参考素材或模型参数。";
  if (status === 401 || status === 403) return "模型服务鉴权失败，请检查 API 密钥和账号权限。";
  if (status === 404) return "模型服务没有找到对应任务或模型，请检查模型配置后重试。";
  if (status === 429) return "模型服务请求过于频繁，请稍后重试。";
  if (status !== null && status >= 500) return `模型服务暂时不可用（HTTP ${status}），请稍后重试。`;
  return null;
}

function isRetryableHttpStatus(status: number | null): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status !== null && status >= 500);
}

function readFirstPublicChineseMessage(candidates: string[]): string | null {
  return candidates.find((candidate) => (
    /[\u3400-\u9fff]/u.test(candidate) &&
    !/[A-Za-z]/.test(candidate) &&
    !/^[a-z0-9_:-]+$/i.test(candidate)
  )) ?? null;
}

function readSourceMessage(value: unknown): string {
  if (value instanceof Error) return value.message.trim();
  if (typeof value === "string") return value.trim();
  return readFirstString(
    readObjectString(value, "message"),
    readObjectString(value, "errorMessage"),
    readObjectString(value, "failureCode"),
    readObjectString(value, "code"),
  );
}

function readRecordField(value: unknown, ...keys: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

function readObjectString(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function readObjectValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function readFirstString(...values: Array<string | null | undefined>): string {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
}

function hasModelErrorContext(context: ModelErrorContext): boolean {
  return Object.values(context).some((value) => value !== null && value !== undefined && value !== "");
}

function isEmptyModelErrorValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ""),
  );
}

function publicModelErrorDetails(diagnostics: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!diagnostics) return null;
  const details = removeUndefined({
    contentType: diagnostics.contentType,
    httpStatus: diagnostics.httpStatus,
    requestId: diagnostics.requestId,
    statusText: diagnostics.statusText,
  });
  return Object.keys(details).length > 0 ? details : null;
}
