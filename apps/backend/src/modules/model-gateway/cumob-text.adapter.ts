import type {
  TextGatewayChatCompletionChunk,
  TextGatewayChatCompletionRequest,
} from "./openai-compatible-text.adapter.ts";

type CumobFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class CumobTextAdapter {
  constructor(
    private readonly config: { fetcher?: CumobFetch } = {},
  ) {}

  async createChatCompletionStream(input: {
    baseURL: string;
    apiKey: string;
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }): Promise<AsyncIterable<TextGatewayChatCompletionChunk>> {
    const request = { ...input.request };
    delete request.max_tokens;
    const response = await (this.config.fetcher ?? fetch)(
      resolveCumobChatEndpoint(input.baseURL),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          model: input.providerModel,
          stream: true,
          stream_options: {
            ...input.request.stream_options,
            include_usage: true,
          },
        }),
        signal: input.signal,
      },
    );

    if (!response.ok) {
      throw cumobTextError(`cumob_text_${response.status}`, response.status);
    }
    if (!response.body) {
      throw cumobTextError("cumob_text_empty_response");
    }

    if (response.headers.get("content-type")?.includes("application/json")) {
      return streamFromJsonResponse(await response.json());
    }
    return streamFromSse(response.body);
  }
}

function resolveCumobChatEndpoint(baseURL: string) {
  const url = new URL(baseURL);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/v1/chat/completions")) {
    return url.toString();
  }
  url.pathname = pathname.endsWith("/v1")
    ? `${pathname}/chat/completions`
    : `${pathname}/v1/chat/completions`;
  return url.toString();
}

async function* streamFromSse(
  body: ReadableStream<Uint8Array>,
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
        const chunk = parseCumobSseEvent(event);
        if (chunk === "done") return;
        if (chunk) yield chunk;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const chunk = parseCumobSseEvent(buffer);
      if (chunk && chunk !== "done") yield chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseCumobSseEvent(
  event: string,
): TextGatewayChatCompletionChunk | "done" | null {
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
    throw cumobTextError("cumob_text_invalid_sse");
  }
  return normalizeCumobChunk(payload);
}

async function* streamFromJsonResponse(
  payload: unknown,
): AsyncIterable<TextGatewayChatCompletionChunk> {
  yield normalizeCumobChunk(payload, true);
}

function normalizeCumobChunk(
  payload: unknown,
  mapMessageToDelta = false,
): TextGatewayChatCompletionChunk {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw cumobTextError("cumob_text_invalid_response");
  }
  const record = payload as Record<string, unknown>;
  if (record.error) {
    throw cumobTextStreamError(record.error);
  }
  if (!Array.isArray(record.choices)) {
    throw cumobTextError("cumob_text_invalid_response");
  }
  if (!mapMessageToDelta) {
    return record as unknown as TextGatewayChatCompletionChunk;
  }
  return {
    ...record,
    object: "chat.completion.chunk",
    choices: record.choices.map((choice) => {
      if (!choice || typeof choice !== "object" || Array.isArray(choice)) return choice;
      const item = choice as Record<string, unknown>;
      return {
        ...item,
        delta: item.delta ?? item.message ?? {},
      };
    }),
  } as unknown as TextGatewayChatCompletionChunk;
}

function cumobTextStreamError(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const providerErrorCode = [record.code, record.type]
    .map((candidate) => String(candidate ?? "").trim())
    .find((candidate) => /^[a-z0-9_.:-]{1,120}$/i.test(candidate));
  const status = [record.status, record.statusCode, record.code]
    .map((candidate) => Number(candidate))
    .find((candidate) => Number.isInteger(candidate) && candidate >= 400 && candidate <= 599);
  return Object.assign(new Error(providerErrorCode || "cumob_text_stream_error"), {
    failureCode: "cumob_text_stream_error",
    ...(providerErrorCode ? { providerErrorCode } : {}),
    ...(status ? { status } : {}),
  });
}

function cumobTextError(failureCode: string, status?: number) {
  return Object.assign(new Error(failureCode), {
    failureCode,
    ...(status ? { status } : {}),
  });
}

export const __cumobTextAdapterTestUtils = { resolveCumobChatEndpoint };
