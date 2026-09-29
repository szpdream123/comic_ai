import { isIP } from "node:net";
import { ModelServiceError, type ModelConfig, type Operation } from "./contracts.ts";

export interface ProductPolicy { models: Record<Operation, string[]>; mediaOrigins: string[] }
export function readServiceConfig(env: NodeJS.ProcessEnv) {
  const keys = configObject(env.MODEL_SERVICE_HMAC_KEYS_JSON, "MODEL_SERVICE_HMAC_KEYS_JSON");
  const raw = configObject(env.MODEL_SERVICE_PRODUCTS_JSON, "MODEL_SERVICE_PRODUCTS_JSON");
  const products = new Map<string, ProductPolicy>();
  for (const [id, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id) || !isObject(value) || !isObject(value.models)) configError();
    const models = Object.fromEntries(["text", "video", "speech", "transcription"].map(operation => {
      const list = value.models[operation] ?? [];
      if (!Array.isArray(list) || list.some(code => typeof code !== "string" || !code.trim())) configError();
      return [operation, list];
    })) as ProductPolicy["models"];
    const origins = value.mediaOrigins ?? [];
    if (!Array.isArray(origins) || origins.some(origin => typeof origin !== "string" || !publicHttpsUrl(origin) || new URL(origin).origin !== origin)) configError();
    products.set(id, { models, mediaOrigins: origins });
  }
  if (!Object.keys(keys).length || !products.size) configError();
  for (const key of Object.values(keys)) {
    if (!isObject(key) || typeof key.workerId !== "string" || !products.has(key.workerId)
      || typeof key.secret !== "string" || key.secret.length < 32) configError();
  }
  return { hmacKeys: JSON.stringify(keys), products };
}

export function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function reject(code = "invalid_request"): never { throw new ModelServiceError(400, code); }
function configError(): never { throw new ModelServiceError(503, "model_service_config_invalid"); }
function configObject(value: string | undefined, key: string): Record<string, any> {
  if (!value?.trim()) throw new ModelServiceError(503, `${key}_required`);
  try { const parsed = JSON.parse(value); if (!isObject(parsed)) configError(); return parsed; }
  catch { configError(); }
}
export function publicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443")
      && !isIP(host.replace(/^\[|\]$/g, "")) && host.includes(".") && !host.endsWith(".")
      && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
  } catch { return false; }
}
export function validateMediaUrl(value: unknown, policy: ProductPolicy) {
  if (typeof value !== "string" || value.length > 16_384 || !publicHttpsUrl(value)
    || !policy.mediaOrigins.includes(new URL(value).origin)) reject("media_url_not_allowed");
}
const videoScalarKeys = ["durationSec", "duration", "aspectRatio", "ratio", "resolution", "seed", "generateAudio", "watermark", "referenceMode", "mode"];
const mediaArrayKeys = ["referenceImages", "referenceVideos", "referenceAudio", "referenceAudios", "filePaths", "videoFilePaths", "audioFilePaths"];
const mediaSingleKeys = ["firstFrame", "lastFrame"];
const speechKeys = ["voice", "voiceId", "format", "sampleRate", "sample_rate", "volume", "rate", "pitch"];
function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) reject("unsupported_parameter");
}
function boundedString(value: unknown, max = 200_000): value is string {
  return typeof value === "string" && value.length <= max && value.length > 0;
}
function validMedia(value: unknown, policy: ProductPolicy) {
  if (isObject(value)) { exactKeys(value, ["url"]); validateMediaUrl(value.url, policy); }
  else validateMediaUrl(value, policy);
}
function validateMessages(messages: unknown, policy: ProductPolicy) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 200) reject("messages_invalid");
  for (const message of messages) {
    if (!isObject(message) || !["system", "user", "assistant", "tool"].includes(message.role)) reject("message_invalid");
    exactKeys(message, ["role", "content", "tool_calls", "tool_call_id", "name"]);
    if (message.name !== undefined && !boundedString(message.name, 64)) reject();
    if (message.role === "tool" && !boundedString(message.tool_call_id, 200)) reject("tool_call_id_required");
    if (message.tool_call_id !== undefined && message.role !== "tool") reject();
    if (message.tool_calls !== undefined) {
      if (message.role !== "assistant" || !Array.isArray(message.tool_calls) || !message.tool_calls.length || message.tool_calls.length > 32) reject();
      for (const call of message.tool_calls) {
        if (!isObject(call) || call.type !== "function" || !boundedString(call.id, 200) || !isObject(call.function)
          || !boundedString(call.function.name, 64) || typeof call.function.arguments !== "string") reject();
        exactKeys(call, ["id", "type", "function"]); exactKeys(call.function, ["name", "arguments"]);
      }
    }
    if (typeof message.content === "string") { if (message.content.length > 200_000) reject(); continue; }
    if (message.content === null && message.role === "assistant" && message.tool_calls?.length) continue;
    if (message.role !== "user" || !Array.isArray(message.content) || !message.content.length || message.content.length > 128) reject("content_invalid");
    for (const part of message.content) {
      if (!isObject(part)) reject();
      if (part.type === "text") { exactKeys(part, ["type", "text"]); if (!boundedString(part.text)) reject(); }
      else if (part.type === "image_url" || part.type === "video_url") {
        exactKeys(part, ["type", part.type]); const media = part[part.type];
        if (!isObject(media)) reject(); exactKeys(media, part.type === "image_url" ? ["url", "detail"] : ["url"]);
        if (media.detail !== undefined && !["auto", "low", "high"].includes(media.detail)) reject();
        validateMediaUrl(media.url, policy);
      } else if (part.type === "input_audio") {
        exactKeys(part, ["type", "input_audio"]); const audio = part.input_audio;
        if (!isObject(audio)) reject(); exactKeys(audio, ["data", "format"]);
        if (!["wav", "mp3"].includes(audio.format) || !boundedString(audio.data, 1_500_000)
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio.data)) reject("audio_invalid");
      } else reject("content_type_unsupported");
    }
  }
}
export function validateIdentity(body: Record<string, unknown>, headerKey: unknown) {
  if (!boundedString(body.subjectId, 160) || /[\x00-\x1f]/.test(body.subjectId)) reject("subject_id_required");
  if (typeof body.requestKey !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(body.requestKey)
    || body.requestKey !== headerKey) reject("signed_idempotency_key_required");
  if (!boundedString(body.model, 160)) reject("model_required");
}
export function validatePayload(body: Record<string, unknown>, operation: Operation, model: ModelConfig, policy: ProductPolicy) {
  const common = ["model", "subjectId", "requestKey"];
  if (operation === "text") {
    exactKeys(body, [...common, "prompt", "messages", "max_tokens", "temperature", "tools", "tool_choice", "response_format", "thinking"]);
    // Pin validated generation defaults with the accepted payload, not mutable catalog state.
    body = { ...Object.fromEntries(Object.entries(model.defaultParams).filter(([key]) =>
      ["temperature", "max_tokens", "response_format", "thinking"].includes(key))), ...body };
    if ((body.prompt !== undefined) === (body.messages !== undefined)) reject("prompt_or_messages_required");
    if (body.prompt !== undefined && (!boundedString(body.prompt) || !body.prompt.trim())) reject("prompt_required");
    if (body.messages !== undefined) validateMessages(body.messages, policy);
    if (body.max_tokens !== undefined && (!Number.isSafeInteger(body.max_tokens) || Number(body.max_tokens) < 1 || Number(body.max_tokens) > 131_072)) reject("max_tokens_invalid");
    if (body.temperature !== undefined && (typeof body.temperature !== "number" || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)) reject();
    if (body.thinking !== undefined) {
      if (!isObject(body.thinking) || !["enabled", "disabled"].includes(body.thinking.type)) reject();
      exactKeys(body.thinking, ["type"]);
    }
    if (body.tools !== undefined) {
      if (!Array.isArray(body.tools) || body.tools.length > 64) reject();
      for (const tool of body.tools) {
        if (!isObject(tool) || tool.type !== "function" || !isObject(tool.function) || !boundedString(tool.function.name, 64)) reject();
        exactKeys(tool, ["type", "function"]); exactKeys(tool.function, ["name", "description", "parameters"]);
        if (tool.function.description !== undefined && !boundedString(tool.function.description, 10_000)) reject();
        if (tool.function.parameters !== undefined && !isObject(tool.function.parameters)) reject();
      }
    }
    if (body.tool_choice !== undefined && !["auto", "none", "required"].includes(body.tool_choice as string)) {
      if (!isObject(body.tool_choice) || body.tool_choice.type !== "function" || !isObject(body.tool_choice.function)
        || !boundedString(body.tool_choice.function.name, 64)) reject();
      exactKeys(body.tool_choice, ["type", "function"]); exactKeys(body.tool_choice.function, ["name"]);
    }
    if (body.response_format !== undefined) {
      if (!isObject(body.response_format) || !["text", "json_object", "json_schema"].includes(body.response_format.type)) reject();
      exactKeys(body.response_format, ["type", "json_schema"]);
      if (body.response_format.type === "json_schema" && !isObject(body.response_format.json_schema)) reject();
    }
    const { model: _m, subjectId: _s, requestKey: _k, prompt, ...payload } = body;
    return { ...payload, ...(prompt !== undefined ? { messages: [{ role: "user", content: prompt }] } : {}) };
  }
  exactKeys(body, [...common, "prompt", "parameters", "operation"]);
  if (!boundedString(body.prompt) || !body.prompt.trim()) reject("prompt_required");
  if (body.parameters !== undefined && !isObject(body.parameters)) reject("parameters_invalid");
  const allowed = operation === "video" ? [...videoScalarKeys, ...mediaArrayKeys, ...mediaSingleKeys] : speechKeys;
  exactKeys((body.parameters ?? {}) as Record<string, unknown>, allowed);
  // Only known model inputs can enter the snapshot; provider-specific routing is never a user parameter.
  const supplied = (body.parameters ?? {}) as Record<string, unknown>;
  const defaults = Object.fromEntries(Object.entries(model.defaultParams).filter(([key]) => allowed.includes(key)));
  const aliases = operation === "video" ? [["durationSec", "duration"], ["aspectRatio", "ratio"], ["referenceMode", "mode"]]
    : [["voice", "voiceId"], ["sampleRate", "sample_rate"]];
  for (const group of aliases) {
    const explicit = group.filter(key => Object.hasOwn(supplied, key));
    if (explicit.length > 1) reject("conflicting_parameter_aliases");
    if (explicit.length) for (const key of group) delete defaults[key];
  }
  const parameters = { ...defaults, ...supplied };
  for (const [key, value] of Object.entries(parameters)) {
    if (operation === "video" && mediaArrayKeys.includes(key)) {
      if (!Array.isArray(value) || value.length > 32) reject("media_array_invalid");
      value.forEach(item => validMedia(item, policy));
    } else if (operation === "video" && mediaSingleKeys.includes(key)) validMedia(value, policy);
    else {
      const integers = ["durationSec", "duration", "seed", "sampleRate", "sample_rate", "volume"];
      if (integers.includes(key)) {
        if (!Number.isSafeInteger(value) || (["durationSec", "duration", "sampleRate", "sample_rate"].includes(key) && Number(value) <= 0)) reject("parameter_value_invalid");
      } else if (["rate", "pitch"].includes(key)) {
        if (typeof value !== "number" || !Number.isFinite(value)) reject("parameter_value_invalid");
      } else if (["generateAudio", "watermark"].includes(key)) {
        if (typeof value !== "boolean") reject("parameter_value_invalid");
      } else if (!boundedString(value, 256) || !value.trim()) reject("parameter_value_invalid");
      if (key === "referenceMode" && !["frame", "image"].includes(value as string)) reject("parameter_value_invalid");
      if (key === "mode" && !["first-frame", "first-last-frame", "reference-video"].includes(value as string)) reject("parameter_value_invalid");
    }
  }
  return { prompt: body.prompt, parameters };
}
export function snapshotModel(model: ModelConfig): ModelConfig {
  const providerConfig: Record<string, unknown> = {};
  for (const key of ["baseURL", "endpoint", "createTaskEndpoint", "queryTaskEndpoint", "requestPath", "apiKeyEnv", "credentialRef", "requestFormat"]) {
    const value = model.providerConfig[key];
    if (typeof value === "string") {
      if (/^https?:/i.test(value)) {
        const url = new URL(value);
        if (url.username || url.password || [...url.searchParams.keys()].some(k => /key|token|secret|auth/i.test(k))) throw new ModelServiceError(503, "provider_credentials_must_use_secret_store");
      }
      providerConfig[key] = value;
    }
  }
  return { ...model, providerConfig, defaultParams: {}, parameterSchema: {}, pricing: {}, limits: {}, uiConfig: {}, capabilities: {}, remark: null };
}
export function publicModel(model: ModelConfig, operation: Operation) {
  const scalarKeys = operation === "video" ? videoScalarKeys : operation === "speech" ? speechKeys : [];
  return { modelCode: model.modelCode, displayName: model.displayName, provider: model.providerName,
    providerName: model.providerName, providerProtocol: model.providerProtocol, mediaType: model.mediaType,
    operation, disabled: false, parameterSchema: {},
    defaultParams: Object.fromEntries(Object.entries(model.defaultParams).filter(([key, value]) => scalarKeys.includes(key) && ["string", "number", "boolean"].includes(typeof value))),
  };
}
