export function translateProviderErrorMessage(value: string | null | undefined): string {
  const message = String(value ?? "").trim();
  if (!message) {
    return "";
  }
  if (!containsEnglish(message)) {
    return message;
  }

  const known = translateKnownProviderErrorMessage(message);
  if (known) {
    return known;
  }

  const httpStatus = readHttpStatus(message);
  if (httpStatus) {
    if (httpStatus === "400") return "模型服务拒绝了请求，请检查提示词、参考素材或模型参数。";
    if (httpStatus === "401" || httpStatus === "403") return "模型服务鉴权失败，请检查 API 密钥和账号权限。";
    if (httpStatus === "404") return "模型服务没有找到对应任务或模型，请检查模型配置后重试。";
    if (httpStatus === "429") return "模型服务请求过于频繁，请稍后重试。";
    if (Number(httpStatus) >= 500) return `模型服务暂时不可用（HTTP ${httpStatus}），请稍后重试。`;
  }

  return "模型服务返回错误，任务没有拿到生成结果，请稍后重试。";
}

export function translateProviderErrorMessageField(key: string | undefined, value: string): string {
  const normalizedKey = String(key ?? "").toLowerCase();
  if (
    normalizedKey.includes("message") ||
    normalizedKey.includes("preview") ||
    normalizedKey.includes("reason") ||
    normalizedKey === "statustext" ||
    normalizedKey === "display"
  ) {
    return translateProviderErrorMessage(value);
  }
  return value;
}

function translateKnownProviderErrorMessage(message: string): string {
  if (/Unexpected end of JSON input/i.test(message)) {
    return "模型服务响应为空或被截断，后端没有拿到完整结果。";
  }
  if (/fetch failed|socket closed|connection.*closed|ECONNRESET|ETIMEDOUT|network/i.test(message)) {
    return "无法连接模型服务或连接中途断开，请稍后重试。";
  }
  if (/aborted|stream aborted|stream.*closed/i.test(message)) {
    return "模型产物传输中断，请稍后重试。";
  }
  if (/content field is required/i.test(message)) {
    return "请求内容缺失，请检查提示词和参考素材后重试。";
  }
  if (/does not exist|do not have access|not found.*model|endpoint.*not found/i.test(message)) {
    return "当前模型不可用或账号没有权限，请检查模型配置和账号权限后重试。";
  }
  if (/cannot exceed|too many|exceed.*item|limit exceeded/i.test(message)) {
    return "参考素材或参数数量超过模型限制，请减少素材数量后重试。";
  }
  if (/not supported by the current model|unsupported.*current model|unsupported request/i.test(message)) {
    return "当前模型不支持这个参数或请求方式，请调整模型参数后重试。";
  }
  if (/duration.*integer.*least|duration.*invalid/i.test(message)) {
    return "生成时长参数不合法，请检查生成时长后重试。";
  }
  if (/generation failed|provider failed|api error/i.test(message)) {
    return "模型服务返回失败，任务没有拿到生成结果，请稍后重试。";
  }
  if (/first frame.*violates|content policy|safety|moderation|policy/i.test(message)) {
    return "参考图或提示词不符合内容安全策略，请调整素材或提示词后重试。";
  }
  if (/ResourceNotFound|specified resource.*not found|task.*not found/i.test(message)) {
    return "模型服务结果已不存在，系统已停止继续轮询，请重新发起生成。";
  }
  if (/upstream overloaded|Service Unavailable|temporarily_unavailable/i.test(message)) {
    return "模型服务繁忙或暂时不可用，请稍后重试。";
  }
  if (/empty_response/i.test(message)) {
    return "模型服务响应为空，请稍后重试。";
  }
  if (/invalid_json/i.test(message)) {
    return "模型服务响应格式异常，后端无法解析结果。";
  }
  if (/invalid_response/i.test(message)) {
    return "模型服务响应中没有可用的生成结果。";
  }
  if (/timeout|timed out/i.test(message)) {
    return "模型服务响应超时，请稍后重试。";
  }
  return "";
}

function readHttpStatus(message: string): string | undefined {
  return /\bHTTP\s*(\d{3})\b/i.exec(message)?.[1] ??
    /(?:image_provider|video_provider|provider_artifact_download|provider_artifact_upload)_(\d{3})/i.exec(message)?.[1];
}

function containsEnglish(value: string) {
  return /[A-Za-z]/.test(value);
}
