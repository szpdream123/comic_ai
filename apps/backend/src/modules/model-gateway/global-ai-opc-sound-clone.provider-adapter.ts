import type {
  ProviderAdapter,
  ProviderPollResult,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import { attachProviderRawResponse, providerResponseDiagnostics, providerResponseError } from "./provider-response-diagnostics.ts";

export class GlobalAiOpcSoundCloneProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      createTaskEndpoint: string;
      queryTaskEndpoint: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const request = await recordProviderAdapterRequest(input, buildSoundClonePayload(input.redactedPayload));
    const response = await (this.config.fetchImpl ?? fetch)(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const payload = await readJsonResponse(response, "global_ai_opc_sound_clone");
    const externalRequestId = readString(payload.id);
    if (!externalRequestId) {
      throw providerResponseError(
        "global_ai_opc_sound_clone_invalid_response",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
    }
    if (normalizeStatus(payload.status) === "failed") {
      throw providerResponseError(
        "global_ai_opc_sound_clone_task_failed",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
    }
    return {
      externalRequestId,
      status: normalizeStatus(payload.status) === "succeeded" ? "succeeded" : "accepted",
      redactedRequest: request,
      redactedResponse: attachProviderRawResponse({
        providerStatus: readString(payload.status) ?? null,
        providerMessage: readString(payload.error) ?? null,
      }, payload),
      artifacts: audioArtifact(payload),
    };
  }

  async poll(input: { externalRequestId: string }): Promise<ProviderPollResult> {
    const response = await (this.config.fetchImpl ?? fetch)(
      this.config.queryTaskEndpoint
        .replace("{taskId}", encodeURIComponent(input.externalRequestId))
        .replace("{id}", encodeURIComponent(input.externalRequestId)),
      {
        method: "GET",
        headers: { authorization: `Bearer ${this.config.apiKey}` },
      },
    );
    const payload = await readJsonResponse(response, "global_ai_opc_sound_clone_poll");
    const status = normalizeStatus(payload.status);
    if (status === "succeeded" && !readString(payload.audioUrl)) {
      throw providerResponseError(
        "global_ai_opc_sound_clone_completed_without_audio_url",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
    }
    return {
      status,
      artifacts: audioArtifact(payload),
      redactedResponse: attachProviderRawResponse({
        taskId: input.externalRequestId,
        providerStatus: readString(payload.status) ?? null,
        providerMessage: readString(payload.error) ?? null,
        modelId: readString(payload.modelId) ?? null,
        subtitleFile: readString(payload.subtitleFile) ?? null,
        amount: payload.amount ?? null,
      }, payload),
    };
  }
}

function buildSoundClonePayload(payload: Record<string, unknown>) {
  const parameters = readRecord(payload.parameters);
  const modelId = readString(parameters.modelId) ?? readString(parameters.voiceId);
  if (!modelId) throw new Error("global_ai_opc_sound_clone_model_id_required");
  const contentText = readString(payload.text) ?? readString(payload.prompt);
  if (!contentText) throw new Error("audio_text_required");
  return stripUndefined({
    modelId,
    contentText,
    soundVersion: readString(parameters.soundVersion),
    language: readString(parameters.language),
    emotion: readString(parameters.emotion),
    speed: readNumber(parameters.speed),
    vol: readNumber(parameters.vol) ?? readNumber(parameters.volume),
    pitch: readInteger(parameters.pitch),
    subtitleEnable: readBoolean(parameters.subtitleEnable),
    subtitleType: readString(parameters.subtitleType),
  });
}

function audioArtifact(payload: Record<string, unknown>) {
  const url = readString(payload.audioUrl);
  if (!url) return undefined;
  const extension = readAudioExtension(url);
  return [{
    mediaType: "audio" as const,
    url,
    mimeType: extension === "wav" ? "audio/wav" : extension === "ogg" ? "audio/ogg" : "audio/mpeg",
    fileExtension: extension,
  }];
}

function readAudioExtension(url: string) {
  const extension = url.split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension === "wav" || extension === "ogg" || extension === "mp3" ? extension : "mp3";
}

async function readJsonResponse(response: Response, prefix: string) {
  const text = await response.text();
  const diagnostics = providerResponseDiagnostics(response, text);
  if (!response.ok) throw providerResponseError(`${prefix}_${response.status}`, diagnostics);
  if (!text.trim()) throw providerResponseError(`${prefix}_empty_response`, diagnostics);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw providerResponseError(`${prefix}_invalid_json`, diagnostics);
  }
}

function normalizeStatus(value: unknown): ProviderPollResult["status"] {
  const status = readString(value)?.toLowerCase();
  if (["completed", "succeeded", "success", "done"].includes(status ?? "")) return "succeeded";
  if (["failed", "error", "cancelled", "canceled"].includes(status ?? "")) return "failed";
  if (["processing", "running", "generating"].includes(status ?? "")) return "running";
  return "accepted";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readInteger(value: unknown) {
  const number = readNumber(value);
  return Number.isInteger(number) ? number : undefined;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
