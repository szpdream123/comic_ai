import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderCancellationResult,
  ProviderPollResult,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import { generationTimeoutMsFor } from "./generation-timeout.policy.ts";

type FlowMusicStage = "lyrics" | "music";

export class ApiMartAudioProviderAdapter implements ProviderAdapter {
  constructor(private readonly config: {
    apiKey: string;
    model?: string;
    lyricsEndpoint: string;
    musicEndpoint: string;
    queryTaskEndpoint: string;
    fetchImpl?: typeof fetch;
  }) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const payload = input.redactedPayload;
    const parameters = readRecord(payload.parameters);
    if (normalizeMode(parameters.mode) !== "music") throw new Error("apimart_audio_music_mode_required");
    const prompt = readString(payload.text) ?? readString(payload.prompt) ?? "";
    const autoGenerateLyrics = parameters.autoGenerateLyrics === true || parameters.generateLyrics === true;
    const stage: FlowMusicStage = autoGenerateLyrics ? "lyrics" : "music";
    const requestBody = stage === "lyrics"
      ? buildLyricsRequest(prompt, this.config.model)
      : buildMusicRequest(prompt, parameters, this.config.model);
    await recordProviderAdapterRequest(input, requestBody);
    const response = await this.post(
      stage === "lyrics" ? this.config.lyricsEndpoint : this.config.musicEndpoint,
      requestBody,
      `${input.requestKey}:${stage}`,
    );
    const taskId = requireTaskId(response);
    return {
      externalRequestId: encodeStageTaskId(stage, taskId),
      status: "accepted",
      redactedResponse: {
        stage,
        providerStatus: readStatus(response) || "submitted",
        requestId: firstString(response, [["request_id"], ["requestId"]]) ?? null,
      },
    };
  }

  async poll(input: { externalRequestId: string; redactedPayload?: Record<string, unknown> }): Promise<ProviderPollResult> {
    const { stage, taskId } = decodeStageTaskId(input.externalRequestId);
    const task = await this.getTask(taskId);
    const status = normalizeStatus(readStatus(task));
    if (status === "accepted" || status === "running") {
      return { status, redactedResponse: { stage, providerStatus: readStatus(task) || status } };
    }
    if (status === "failed") {
      return { status: "failed", redactedResponse: { stage, providerStatus: readStatus(task) || "failed" } };
    }
    if (stage === "lyrics") {
      const generated = extractLyrics(task);
      const snapshot = readRecord(input.redactedPayload);
      const parameters = readRecord(snapshot.parameters);
      const prompt = readString(snapshot.text) ?? readString(snapshot.prompt) ?? "";
      const musicRequest = buildMusicRequest(prompt, {
        ...parameters,
        lyrics: generated.lyrics,
        title: generated.title || parameters.title,
      }, this.config.model);
      const submittedMusic = await this.post(this.config.musicEndpoint, musicRequest, `flowmusic:${taskId}:music`);
      const musicTaskId = requireTaskId(submittedMusic);
      return {
        status: "running",
        externalRequestId: encodeStageTaskId("music", musicTaskId),
        redactedResponse: {
          stage: "music",
          previousStage: "lyrics",
          providerStatus: readStatus(submittedMusic) || "submitted",
          generatedLyrics: generated.lyrics,
          generatedTitle: generated.title,
        },
      };
    }
    const providerState = readRecord(readRecord(input.redactedPayload).providerState);
    const track = extractTrack(task);
    const lyrics = track.lyrics ?? readString(providerState.generatedLyrics);
    const artifact: MediaGenerationArtifact = {
      mediaType: "audio",
      url: track.url,
      mimeType: mimeTypeFromUrl(track.url),
      fileExtension: extensionFromUrl(track.url),
      ...(lyrics ? { lyrics } : {}),
      ...(track.title || readString(providerState.generatedTitle)
        ? { title: track.title ?? readString(providerState.generatedTitle) }
        : {}),
    };
    return {
      status: "succeeded",
      artifacts: [artifact],
      redactedResponse: {
        stage: "music",
        providerStatus: readStatus(task) || "completed",
        clipId: track.clipId ?? null,
        title: track.title ?? readString(providerState.generatedTitle) ?? null,
        ...(lyrics ? { lyrics } : {}),
      },
    };
  }

  async cancel(): Promise<ProviderCancellationResult> {
    return {
      status: "unknown",
      redactedResponse: { providerStatus: "cancel_not_supported" },
    };
  }

  private async post(endpoint: string, body: Record<string, unknown>, idempotencyKey: string) {
    const response = await (this.config.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      signal: AbortSignal.timeout(generationTimeoutMsFor("audio")),
      body: JSON.stringify(body),
    });
    return readJsonResponse(response, "apimart_audio_submit_failed");
  }

  private async getTask(taskId: string) {
    const endpoint = this.config.queryTaskEndpoint.replace("{taskId}", encodeURIComponent(taskId));
    const response = await (this.config.fetchImpl ?? fetch)(endpoint, {
      headers: { authorization: `Bearer ${this.config.apiKey}` },
      signal: AbortSignal.timeout(generationTimeoutMsFor("audio")),
    });
    return readJsonResponse(response, "apimart_audio_poll_failed");
  }
}

function buildLyricsRequest(prompt: string, model?: string) {
  if (!prompt || prompt.length > 3_000) throw new Error("apimart_audio_lyrics_prompt_invalid");
  return { model: model || "flowmusic", prompt };
}

function buildMusicRequest(prompt: string, parameters: Record<string, unknown>, model?: string) {
  const lyrics = readString(parameters.lyrics);
  if (!prompt && !lyrics) throw new Error("apimart_audio_music_input_required");
  const body: Record<string, unknown> = { model: model || "flowmusic" };
  if (prompt) body.sound_prompt = prompt;
  if (lyrics) body.lyrics = lyrics;
  const title = readString(parameters.title ?? parameters.musicTitle);
  if (title) body.title = title;
  const bpm = optionalInteger(parameters.bpm ?? parameters.musicBpm, 1, 400, "apimart_audio_bpm_invalid");
  if (bpm !== undefined) body.bpm = String(bpm);
  const length = optionalInteger(parameters.durationSec ?? parameters.length ?? parameters.musicDuration, 1, 240, "apimart_audio_duration_invalid");
  if (length !== undefined) body.length = length;
  const seed = readString(parameters.seed);
  if (seed) body.seed = seed;
  return body;
}

function extractLyrics(payload: Record<string, unknown>) {
  const lyrics = firstString(payload, [
    ["result", "lyrics", "0", "lyrics"], ["data", "result", "lyrics", "0", "lyrics"], ["lyrics"],
  ]);
  if (!lyrics) throw new Error("apimart_audio_lyrics_missing");
  return {
    lyrics,
    title: firstString(payload, [["result", "lyrics", "0", "title"], ["data", "result", "lyrics", "0", "title"]]) ?? "",
  };
}

function extractTrack(payload: Record<string, unknown>) {
  const url = firstString(payload, [
    ["result", "music", "0", "audio_url"], ["result", "music", "0", "url"], ["result", "music", "0", "wav_url"],
    ["data", "result", "music", "0", "audio_url"], ["data", "result", "music", "0", "url"],
  ]);
  if (!url || !isHttpUrl(url)) throw new Error("apimart_audio_artifact_missing");
  return {
    url,
    lyrics: firstString(payload, [["result", "music", "0", "lyrics"], ["data", "result", "music", "0", "lyrics"]]),
    title: firstString(payload, [["result", "music", "0", "title"], ["data", "result", "music", "0", "title"]]),
    clipId: firstString(payload, [["result", "music", "0", "clip_id"], ["data", "result", "music", "0", "clip_id"]]),
  };
}

function requireTaskId(payload: Record<string, unknown>) {
  const taskId = firstString(payload, [["data", "task_id"], ["data", "taskId"], ["task_id"], ["taskId"], ["id"]]);
  if (!taskId) throw new Error("apimart_audio_task_id_missing");
  return taskId;
}

function readStatus(payload: Record<string, unknown>) {
  return firstString(payload, [["data", "status"], ["status"], ["data", "task_status"], ["task_status"]]) ?? "";
}

function normalizeStatus(value: string): "accepted" | "running" | "succeeded" | "failed" {
  const status = value.trim().toLowerCase();
  if (["completed", "complete", "succeeded", "success"].includes(status)) return "succeeded";
  if (["failed", "error", "cancelled", "canceled"].includes(status)) return "failed";
  if (["queued", "pending", "submitted", "accepted", "created"].includes(status)) return "accepted";
  return "running";
}

function encodeStageTaskId(stage: FlowMusicStage, taskId: string) {
  return `${stage}:${taskId}`;
}

function decodeStageTaskId(value: string) {
  const match = /^(lyrics|music):(.+)$/.exec(String(value ?? ""));
  if (!match) throw new Error("apimart_audio_task_id_invalid");
  return { stage: match[1] as FlowMusicStage, taskId: match[2]! };
}

async function readJsonResponse(response: Response, failureCode: string) {
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error(`${failureCode}:invalid_response`); }
  if (!response.ok) throw new Error(`${failureCode}:${response.status}`);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(`${failureCode}:invalid_response`);
  const record = payload as Record<string, unknown>;
  return readRecord(record.data) && Object.keys(readRecord(record.data)).length
    ? { ...record, data: readRecord(record.data) }
    : record;
}

function firstString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const segment of path) {
      if (!value || typeof value !== "object") { value = undefined; break; }
      value = (value as Record<string, unknown>)[segment];
    }
    const text = readString(value);
    if (text) return text;
  }
  return undefined;
}

function optionalInteger(value: unknown, minimum: number, maximum: number, code: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(code);
  return number;
}

function normalizeMode(value: unknown) {
  return readString(value)?.toLowerCase().replace(/[._]/g, "-") ?? "";
}

function extensionFromUrl(value: string) {
  try { return new URL(value).pathname.split(".").pop()?.toLowerCase() || "mp3"; } catch { return "mp3"; }
}

function mimeTypeFromUrl(value: string) {
  const extension = extensionFromUrl(value);
  if (extension === "wav") return "audio/wav";
  if (extension === "flac") return "audio/flac";
  if (extension === "ogg") return "audio/ogg";
  return "audio/mpeg";
}

function isHttpUrl(value: string) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
