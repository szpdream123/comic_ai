import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

const defaultModel = "seedance-2-0-i2v";

export class SeedanceVideoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildCreateTaskPayload(input, this.config.model)),
    });

    if (!response.ok) {
      throw new Error(`seedance_video_${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const externalRequestId = findFirstString(payload, [
      ["id"],
      ["task_id"],
      ["taskId"],
      ["data", "id"],
      ["data", "task_id"],
      ["data", "taskId"],
      ["result", "id"],
      ["result", "task_id"],
      ["result", "taskId"],
    ]);

    if (!externalRequestId) {
      throw new Error("seedance_video_invalid_response");
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        providerStatus:
          findFirstString(payload, [
            ["status"],
            ["data", "status"],
            ["result", "status"],
          ]) ?? null,
      },
    };
  }

  async poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }> {
    if (!this.config.queryTaskEndpoint) {
      throw new Error("seedance_video_query_endpoint_required");
    }

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(
      this.config.queryTaskEndpoint.replace(
        "{taskId}",
        encodeURIComponent(input.externalRequestId),
      ),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`seedance_video_poll_${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const providerStatus = normalizeProviderStatus(
      findFirstString(payload, [
        ["status"],
        ["data", "status"],
        ["result", "status"],
      ]),
    );

    return {
      status: providerStatus,
      videoUrl: findFirstString(payload, [
        ["video_url"],
        ["videoUrl"],
        ["data", "video_url"],
        ["data", "videoUrl"],
        ["data", "result", "video_url"],
        ["data", "result", "videoUrl"],
        ["result", "video_url"],
        ["result", "videoUrl"],
      ]),
      redactedResponse: {
        providerStatus,
        taskId: input.externalRequestId,
        providerErrorCode:
          findFirstString(payload, [
            ["error", "code"],
            ["data", "error", "code"],
            ["result", "error", "code"],
          ]) ?? null,
        providerMessage:
          findFirstString(payload, [
            ["message"],
            ["error", "message"],
            ["data", "message"],
            ["data", "error", "message"],
            ["result", "message"],
            ["result", "error", "message"],
          ]) ?? null,
      },
    };
  }
}

function buildCreateTaskPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters =
    payload.parameters && typeof payload.parameters === "object"
      ? (payload.parameters as Record<string, unknown>)
      : {};

  return {
    model: model ?? defaultModel,
    prompt: readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "",
    firstFrameUrl:
      readString(payload.firstFrameUrl) ??
      readString(payload.imageUrl) ??
      readString(payload.referenceImageUrl),
    parameters,
    requestKey: input.requestKey,
  };
}

function normalizeProviderStatus(
  status: string | undefined,
): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized === "succeeded" ||
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "succeeded";
  }
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "canceled" ||
    normalized === "cancelled"
  ) {
    return "failed";
  }
  if (
    normalized === "running" ||
    normalized === "processing" ||
    normalized === "generating"
  ) {
    return "running";
  }
  return "accepted";
}

function findFirstString(
  payload: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readPath(payload: Record<string, unknown>, path: string[]) {
  let current: unknown = payload;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
