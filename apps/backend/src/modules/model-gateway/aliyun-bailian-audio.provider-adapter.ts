import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import { generationTimeoutMsFor } from "./generation-timeout.policy.ts";
import {
  attachProviderRawResponse,
  providerResponseError,
  readProviderResponseDiagnostics,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "cosyvoice-v2";
const defaultFormat = "mp3";
const supportedSampleRates = new Set([8_000, 16_000, 22_050, 24_000, 44_100, 48_000]);

export class AliyunBailianAudioProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint?: string;
      requestTimeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const requestBody = await recordProviderAdapterRequest(
      input,
      buildCreateTaskPayload(input, this.config.model),
    );
    const response = await (this.config.fetchImpl ?? fetch)(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(generationTimeoutMsFor("audio")),
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) throw await audioProviderHttpError(response, "audio_provider_submit");

    const payload = await readJsonResponse(response, "audio_provider_invalid_response");
    const providerStatus = providerTaskStatus(payload);
    const artifact = audioArtifactFromPayload(payload, requestBody);
    const externalRequestId = firstString(payload, [
      ["request_id"],
      ["requestId"],
      ["output", "audio", "id"],
      ["output", "task_id"],
      ["output", "taskId"],
      ["task_id"],
      ["taskId"],
      ["data", "task_id"],
      ["data", "taskId"],
    ]);
    if (!artifact) throw new Error("audio_provider_artifact_missing");

    return {
      externalRequestId: externalRequestId ?? input.providerRequestId,
      status: "succeeded",
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? defaultModel,
        providerStatus: providerStatus ?? null,
        requestId: firstString(payload, [["request_id"], ["requestId"]]) ?? null,
        audioId: firstString(payload, [["output", "audio", "id"]]) ?? null,
        expiresAt: firstNumber(payload, [["output", "audio", "expires_at"], ["output", "audio", "expiresAt"]]) ?? null,
        usageCharacters: firstNumber(payload, [["usage", "characters"]]) ?? null,
        hasArtifact: true,
      }, payload),
      artifacts: [artifact],
    };
  }

  async poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    artifacts?: MediaGenerationArtifact[];
    redactedResponse: Record<string, unknown>;
  }> {
    void input;
    throw new Error("audio_provider_sync_poll_not_supported");
  }
}

function buildCreateTaskPayload(input: ProviderSubmissionInput, model?: string) {
  const payload = input.redactedPayload;
  const parameters = readRecord(payload.parameters);
  const text = readString(payload.text) ?? readString(payload.prompt);
  if (!text) throw new Error("audio_provider_text_required");
  const voice = readString(parameters.voice) ?? readString(parameters.voiceId) ?? readString(payload.voice);
  if (!voice) throw new Error("audio_provider_voice_required");
  const format = normalizeAudioFormat(parameters.format);
  return {
    model: model ?? defaultModel,
    input: {
      text,
      voice,
      format,
      ...optionalSampleRate(parameters.sampleRate ?? parameters.sample_rate),
      ...optionalIntegerRange("volume", parameters.volume, 0, 100),
      ...optionalNumberRange("rate", parameters.rate, 0.5, 2),
      ...optionalNumberRange("pitch", parameters.pitch, 0.5, 2),
    },
  };
}

function audioArtifactFromPayload(
  payload: Record<string, unknown>,
  requestBody?: Record<string, unknown>,
): MediaGenerationArtifact | undefined {
  const url = firstString(payload, [
    ["output", "audio", "url"],
    ["output", "audio_url"],
    ["output", "audioUrl"],
    ["output", "url"],
    ["output", "results", "0", "url"],
    ["data", "audio", "url"],
    ["data", "audio_url"],
    ["data", "audioUrl"],
    ["audio", "url"],
    ["audio_url"],
    ["audioUrl"],
  ]);
  if (!url) return undefined;
  if (!isHttpUrl(url)) throw new Error("audio_provider_artifact_url_invalid");
  const responseMimeType = firstString(payload, [
    ["output", "audio", "mime_type"],
    ["output", "audio", "mimeType"],
    ["output", "mime_type"],
    ["output", "mimeType"],
    ["data", "mime_type"],
    ["data", "mimeType"],
  ]);
  if (responseMimeType && !responseMimeType.toLowerCase().startsWith("audio/")) {
    throw new Error("audio_provider_artifact_mime_invalid");
  }
  const requestParameters = readRecord(requestBody?.input);
  const format = normalizeAudioFormat(
    formatFromMimeType(responseMimeType) ?? requestParameters.format ?? extensionFromUrl(url),
  );
  return {
    mediaType: "audio",
    mimeType: responseMimeType ?? mimeTypeForFormat(format),
    fileExtension: format,
    url,
    ...(firstString(payload, [
      ["output", "transcript"],
      ["output", "text"],
      ["data", "transcript"],
      ["data", "text"],
      ["transcript"],
      ["text"],
    ]) ? { transcript: firstString(payload, [
      ["output", "transcript"],
      ["output", "text"],
      ["data", "transcript"],
      ["data", "text"],
      ["transcript"],
      ["text"],
    ]) } : {}),
    ...(firstString(payload, [
      ["output", "lyrics"],
      ["output", "song", "lyrics"],
      ["data", "lyrics"],
      ["data", "song", "lyrics"],
      ["lyrics"],
    ]) ? { lyrics: firstString(payload, [
      ["output", "lyrics"],
      ["output", "song", "lyrics"],
      ["data", "lyrics"],
      ["data", "song", "lyrics"],
      ["lyrics"],
    ]) } : {}),
  };
}

function providerTaskStatus(payload: Record<string, unknown>) {
  return firstString(payload, [
    ["output", "finish_reason"],
    ["output", "finishReason"],
    ["output", "task_status"],
    ["output", "taskStatus"],
    ["task_status"],
    ["taskStatus"],
    ["data", "task_status"],
    ["data", "taskStatus"],
    ["status"],
  ]);
}

async function readJsonResponse(response: Response, errorCode: string) {
  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(errorCode);
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === errorCode) throw error;
    throw new Error(errorCode);
  }
}

async function audioProviderHttpError(response: Response, prefix: string) {
  const { text, diagnostics } = await readProviderResponseDiagnostics(response);
  const error = readProviderError(text);
  return providerResponseError(
    [prefix, String(response.status), error.code, error.message].filter(Boolean).join(":"),
    diagnostics as ProviderResponseDiagnostics,
  );
}

function readProviderError(value: string) {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    return {
      code: firstString(payload, [["code"], ["error", "code"], ["output", "code"]]),
      message: firstString(payload, [["message"], ["error", "message"], ["output", "message"]]),
    };
  } catch {
    return { code: undefined, message: undefined };
  }
}

function firstString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const segment of path) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    const normalized = readString(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function firstNumber(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const segment of path) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function optionalSampleRate(value: unknown) {
  if (value === undefined || value === null || value === "") return {};
  const number = Number(value);
  if (!Number.isInteger(number) || !supportedSampleRates.has(number)) {
    throw new Error("audio_provider_sample_rate_invalid");
  }
  return { sample_rate: number };
}

function optionalIntegerRange(key: string, value: unknown, minimum: number, maximum: number) {
  if (value === undefined || value === null || value === "") return {};
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`audio_provider_${key}_invalid`);
  }
  return { [key]: number };
}

function optionalNumberRange(key: string, value: unknown, minimum: number, maximum: number) {
  if (value === undefined || value === null || value === "") return {};
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`audio_provider_${key}_invalid`);
  }
  return { [key]: number };
}

function normalizeAudioFormat(value: unknown) {
  const format = readString(value)?.toLowerCase() ?? defaultFormat;
  if (!["mp3", "wav", "pcm", "opus"].includes(format)) {
    throw new Error("audio_provider_format_invalid");
  }
  return format;
}

function mimeTypeForFormat(format: string) {
  if (format === "wav") return "audio/wav";
  if (format === "pcm") return "audio/pcm";
  if (format === "opus") return "audio/opus";
  return "audio/mpeg";
}

function formatFromMimeType(value: string | undefined) {
  const mimeType = value?.toLowerCase().split(";", 1)[0]?.trim();
  if (!mimeType) return undefined;
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave") return "wav";
  if (mimeType === "audio/pcm" || mimeType === "audio/l16") return "pcm";
  if (mimeType === "audio/opus") return "opus";
  return mimeType.split("/")[1];
}

function extensionFromUrl(value: string) {
  try {
    return new URL(value).pathname.split(".").pop() ?? "";
  } catch {
    return "";
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
