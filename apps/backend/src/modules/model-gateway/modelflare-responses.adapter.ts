import type {
  TextGatewayChatCompletionChunk,
  TextGatewayChatCompletionRequest,
} from "./openai-compatible-text.adapter.ts";

type ModelflareFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class ModelflareResponsesAdapter {
  constructor(
    private readonly config: { fetcher?: ModelflareFetch } = {},
  ) {}

  async createChatCompletionStream(input: {
    baseURL: string;
    apiKey: string;
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }): Promise<AsyncIterable<TextGatewayChatCompletionChunk>> {
    const response = await (this.config.fetcher ?? fetch)(
      resolveModelflareResponsesEndpoint(input.baseURL),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.providerModel,
          input: toResponsesInput(input.request.messages),
          stream: true,
          store: false,
          ...(input.request.temperature !== undefined
            ? { temperature: input.request.temperature }
            : {}),
          ...(input.request.max_tokens !== undefined
            ? { max_output_tokens: input.request.max_tokens }
            : {}),
          ...(input.request.response_format
            ? { text: { format: input.request.response_format } }
            : {}),
        }),
        signal: input.signal,
      },
    );

    if (!response.ok) {
      throw modelflareError(`modelflare_responses_${response.status}`, response.status);
    }
    if (!response.body) {
      throw modelflareError("modelflare_responses_empty_response");
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
      return streamFromJsonResponse(await response.json(), input.providerModel);
    }
    return streamFromSse(response.body, input.providerModel);
  }
}

function resolveModelflareResponsesEndpoint(baseURL: string) {
  const url = new URL(baseURL);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/responses")) return url.toString();
  url.pathname = pathname.endsWith("/v1")
    ? `${pathname}/responses`
    : `${pathname}/v1/responses`;
  return url.toString();
}

function toResponsesInput(messages: TextGatewayChatCompletionRequest["messages"]) {
  return messages.map((message) => ({
    role: normalizeResponsesRole(message.role),
    content: toResponsesContent(message.content),
  }));
}

function normalizeResponsesRole(role: string) {
  return ["system", "developer", "assistant", "user"].includes(role)
    ? role
    : "user";
}

function toResponsesContent(content: unknown): Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }
  if (!Array.isArray(content)) {
    return [{ type: "input_text", text: "" }];
  }
  const parts = content.flatMap((part): Array<Record<string, unknown>> => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const record = part as Record<string, unknown>;
    if ((record.type === "text" || record.type === "input_text") && typeof record.text === "string") {
      return [{ type: "input_text", text: record.text }];
    }
    if (record.type === "image_url" && record.image_url && typeof record.image_url === "object") {
      const image = record.image_url as Record<string, unknown>;
      if (typeof image.url !== "string") return [];
      return [{
        type: "input_image",
        image_url: image.url,
        ...(typeof image.detail === "string" ? { detail: image.detail } : {}),
      }];
    }
    if (record.type === "video_url" && record.video_url && typeof record.video_url === "object") {
      const video = record.video_url as Record<string, unknown>;
      if (typeof video.url !== "string") return [];
      return [{
        type: "input_file",
        file_url: video.url,
        filename: filenameFromUrl(video.url),
      }];
    }
    return [];
  });
  return parts.length > 0 ? parts : [{ type: "input_text", text: "" }];
}

function filenameFromUrl(value: string) {
  try {
    const filename = new URL(value).pathname.split("/").filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename) : "reference.mp4";
  } catch {
    return "reference.mp4";
  }
}

async function* streamFromSse(
  body: ReadableStream<Uint8Array>,
  providerModel: string,
): AsyncIterable<TextGatewayChatCompletionChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) {
        const chunk = parseResponsesSseEvent(event, providerModel);
        if (chunk === "done") return;
        if (chunk) yield chunk;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const chunk = parseResponsesSseEvent(buffer, providerModel);
      if (chunk && chunk !== "done") yield chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseResponsesSseEvent(
  event: string,
  providerModel: string,
): TextGatewayChatCompletionChunk | "done" | null {
  const eventType = event
    .split(/\r?\n/)
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data) return null;
  if (data === "[DONE]") return "done";
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw modelflareError("modelflare_responses_invalid_sse");
  }
  return normalizeResponsesEvent(payload, eventType, providerModel);
}

function normalizeResponsesEvent(
  payload: unknown,
  eventType: string | undefined,
  providerModel: string,
): TextGatewayChatCompletionChunk | "done" | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw modelflareError("modelflare_responses_invalid_response");
  }
  const record = payload as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : eventType;
  if (type === "response.output_text.delta") {
    if (typeof record.delta !== "string") return null;
    return gatewayChunk(readResponseId(record), providerModel, record.delta, null);
  }
  if (type === "response.completed") {
    const response = readResponseRecord(record);
    return {
      ...gatewayChunk(readString(response.id), providerModel, "", "stop"),
      usage: normalizeResponsesUsage(response.usage),
    };
  }
  if (type === "response.failed" || type === "error") {
    throw modelflareStreamError(record);
  }
  return null;
}

async function* streamFromJsonResponse(
  payload: unknown,
  providerModel: string,
): AsyncIterable<TextGatewayChatCompletionChunk> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw modelflareError("modelflare_responses_invalid_response");
  }
  const response = payload as Record<string, unknown>;
  const text = readString(response.output_text) || extractOutputText(response.output);
  if (text) yield gatewayChunk(readString(response.id), providerModel, text, null);
  yield {
    ...gatewayChunk(readString(response.id), providerModel, "", "stop"),
    usage: normalizeResponsesUsage(response.usage),
  };
}

function extractOutputText(output: unknown) {
  if (!Array.isArray(output)) return "";
  return output.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return [];
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("");
}

function readResponseRecord(record: Record<string, unknown>) {
  return record.response && typeof record.response === "object" && !Array.isArray(record.response)
    ? record.response as Record<string, unknown>
    : record;
}

function readResponseId(record: Record<string, unknown>) {
  return readString(readResponseRecord(record).id);
}

function normalizeResponsesUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const promptTokens = readFiniteNumber(usage.input_tokens);
  const completionTokens = readFiniteNumber(usage.output_tokens);
  const totalTokens = readFiniteNumber(usage.total_tokens)
    ?? (promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined);
  return {
    ...(promptTokens !== undefined ? { prompt_tokens: promptTokens } : {}),
    ...(completionTokens !== undefined ? { completion_tokens: completionTokens } : {}),
    ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
    input_tokens: promptTokens,
    output_tokens: completionTokens,
  };
}

function gatewayChunk(
  id: string,
  model: string,
  content: string,
  finishReason: string | null,
): TextGatewayChatCompletionChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: content ? { content } : {},
      finish_reason: finishReason,
    }],
  } as TextGatewayChatCompletionChunk;
}

function modelflareStreamError(record: Record<string, unknown>) {
  const response = readResponseRecord(record);
  const error = response.error && typeof response.error === "object" && !Array.isArray(response.error)
    ? response.error as Record<string, unknown>
    : record.error && typeof record.error === "object" && !Array.isArray(record.error)
      ? record.error as Record<string, unknown>
      : {};
  const providerErrorCode = [error.code, error.type]
    .map((candidate) => String(candidate ?? "").trim())
    .find((candidate) => /^[a-z0-9_.:-]{1,120}$/i.test(candidate));
  return Object.assign(new Error(providerErrorCode || "modelflare_responses_stream_error"), {
    failureCode: "modelflare_responses_stream_error",
    ...(providerErrorCode ? { providerErrorCode } : {}),
  });
}

function modelflareError(failureCode: string, status?: number) {
  return Object.assign(new Error(failureCode), {
    failureCode,
    ...(status ? { status } : {}),
  });
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export const __modelflareResponsesAdapterTestUtils = {
  resolveModelflareResponsesEndpoint,
  toResponsesInput,
};
