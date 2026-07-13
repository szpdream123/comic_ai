import type { SqlDatabase } from "../shared/db/sql.ts";
import type {
  OpenAICompatibleTextAdapter,
  TextGatewayChatCompletionChunk,
  TextGatewayChatCompletionRequest,
} from "./openai-compatible-text.adapter.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
} from "./provider-request.service.ts";
import {
  createDefaultTextModelCatalog,
  resolveTextModelCatalogEntry,
  type TextModelCatalogEntry,
} from "./text-model-catalog.ts";
import { TextModelGatewayError } from "./text-model-gateway.errors.ts";
import {
  completeUserModelRequestLog,
  createUserModelRequestLog,
} from "./user-model-request-log.service.ts";

export const textModelGatewayOperationNames = {
  chatCompletions: "llm.chat.completions",
} as const;

export interface TextModelGatewayRequestContext {
  projectId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  createdByUserId?: string | null;
  requestKey: string;
  requestHash: string;
  payloadHash: string;
  payloadSummary?: string;
  providerOperation: typeof textModelGatewayOperationNames.chatCompletions;
  signal?: AbortSignal;
}

export type TextGatewayFinalUsage =
  | {
      status: "succeeded";
      usage: Record<string, unknown> | null;
      usageSource: "provider" | "provider_missing";
    }
  | {
      status: "failed" | "canceled";
      failureCode: string;
      usage: Record<string, unknown> | null;
      usageSource: "provider" | "provider_missing";
    };

export interface TextGatewayChatStreamResult {
  providerRequestId: string;
  stream: AsyncIterable<TextGatewayChatCompletionChunk>;
  abort: () => void;
  completed: Promise<TextGatewayFinalUsage>;
}

export class TextModelGatewayService {
  readonly chat = {
    completions: {
      create: (
        request: TextGatewayChatCompletionRequest,
        context: TextModelGatewayRequestContext,
      ) => this.createChatCompletion(request, context),
    },
  };

  constructor(
    private readonly config: {
      db: SqlDatabase;
      adapter: Pick<
        OpenAICompatibleTextAdapter,
        "createChatCompletionStream"
      >;
      catalog?: readonly TextModelCatalogEntry[];
      env?: NodeJS.ProcessEnv;
      now?: () => Date;
    },
  ) {}

  private async createChatCompletion(
    request: TextGatewayChatCompletionRequest,
    context: TextModelGatewayRequestContext,
  ): Promise<TextGatewayChatStreamResult> {
    const now = this.config.now ?? (() => new Date());
    const model = resolveTextModelCatalogEntry(
      this.config.catalog ?? createDefaultTextModelCatalog(),
      request.model,
      this.config.env,
    );
    const prepared = await createOrReuseProviderRequest(this.config.db, {
      projectId: context.projectId ?? null,
      workflowId: context.workflowId ?? null,
      taskId: context.taskId ?? null,
      attemptId: context.attemptId ?? null,
      providerName: model.providerName,
      providerOperation: context.providerOperation,
      requestKey: context.requestKey,
      requestHash: context.requestHash,
      payloadRef: `text-gateway://${context.requestKey}`,
      payloadHash: context.payloadHash,
      redactedPayload: {
        model: model.id,
        providerModel: model.providerModel,
        messageCount: request.messages.length,
        payloadHash: context.payloadHash,
        payloadSummary: context.payloadSummary ?? null,
      },
      userId: context.createdByUserId!,
      now: now(),
    });

    if (prepared.request.externalSubmissionStartedAt) {
      throw new TextModelGatewayError("provider_request_already_started");
    }

    const started = await markExternalSubmissionStarted(this.config.db, {
      providerRequestId: prepared.request.id,
      externalRequestId: null,
      now: now(),
    });
    const upstreamRequest = prepareProviderChatCompletionRequest(
      request,
      model.providerModel,
    );
    await createUserModelRequestLog(this.config.db, {
      providerRequestId: started.id,
      projectId: context.projectId ?? null,
      workflowId: context.workflowId ?? null,
      taskId: context.taskId ?? null,
      attemptId: context.attemptId ?? null,
      userId: context.createdByUserId ?? null,
      providerName: model.providerName,
      providerOperation: context.providerOperation,
      modelId: model.id,
      providerModel: model.providerModel,
      requestKey: context.requestKey,
      requestHash: context.requestHash,
      payloadHash: context.payloadHash,
      payloadSummary: context.payloadSummary ?? null,
      requestBody: upstreamRequest,
      requestText: extractRequestText(upstreamRequest.messages),
      now: now(),
    });
    const abortController = new AbortController();
    let aborted = false;
    const abortFromContext = () => {
      aborted = true;
      abortController.abort();
    };
    if (context.signal?.aborted) {
      abortFromContext();
    } else {
      context.signal?.addEventListener("abort", abortFromContext, { once: true });
    }
    let upstreamStream: AsyncIterable<TextGatewayChatCompletionChunk>;
    try {
      upstreamStream = await this.config.adapter.createChatCompletionStream({
        baseURL: model.baseURL,
        apiKey: model.apiKey,
        providerModel: model.providerModel,
        request: upstreamRequest,
        signal: abortController.signal,
      });
    } catch (error) {
      const status = aborted ? "canceled" : "failed";
      const failureCode = aborted ? "client_aborted_stream" : "provider_stream_error";
      const redactedResponse = {
        model: model.id,
        providerModel: model.providerModel,
        chunkCount: 0,
        finishReasons: [],
        usage: null,
        usageSource: "provider_missing",
      };
      if (status === "canceled") {
        await markProviderRequestCanceled(this.config.db, {
          providerRequestId: started.id,
          failureCode,
          redactedResponse,
          now: now(),
        });
      } else {
        await markProviderRequestFailed(this.config.db, {
          providerRequestId: started.id,
          failureCode,
          redactedResponse,
          now: now(),
        });
      }
      await completeUserModelRequestLog(this.config.db, {
        providerRequestId: started.id,
        status,
        responseText: null,
        responseUsage: null,
        finishReasons: [],
        failureCode,
        now: now(),
      });
      context.signal?.removeEventListener("abort", abortFromContext);
      throw error;
    }
    const tracker = new StreamTracker();
    let resolveCompleted!: (value: TextGatewayFinalUsage) => void;
    const completed = new Promise<TextGatewayFinalUsage>((resolve) => {
      resolveCompleted = resolve;
    });

    const stream = this.wrapStream({
      stream: upstreamStream,
      providerRequestId: started.id,
      modelId: model.id,
      providerModel: model.providerModel,
      tracker,
      isAborted: () => aborted,
      resolveCompleted,
      now,
    });

    return {
      providerRequestId: started.id,
      stream,
      abort: () => {
        aborted = true;
        abortController.abort();
      },
      completed: completed.finally(() => {
        context.signal?.removeEventListener("abort", abortFromContext);
      }),
    };
  }

  private async *wrapStream(input: {
    stream: AsyncIterable<TextGatewayChatCompletionChunk>;
    providerRequestId: string;
    modelId: string;
    providerModel: string;
    tracker: StreamTracker;
    isAborted: () => boolean;
    resolveCompleted: (value: TextGatewayFinalUsage) => void;
    now: () => Date;
  }) {
    try {
      for await (const chunk of input.stream) {
        input.tracker.observe(chunk);
        yield chunk;
      }

      const usage = input.tracker.usage;
      const usageSource = usage ? "provider" : "provider_missing";
      const final: TextGatewayFinalUsage = {
        status: "succeeded",
        usage,
        usageSource,
      };

      await markProviderRequestSucceeded(this.config.db, {
        providerRequestId: input.providerRequestId,
        externalRequestId: input.tracker.externalRequestId,
        redactedResponse: {
          model: input.modelId,
          providerModel: input.providerModel,
          chunkCount: input.tracker.chunkCount,
          finishReasons: input.tracker.finishReasons,
          usage,
          usageSource,
        },
        now: input.now(),
      });
      await completeUserModelRequestLog(this.config.db, {
        providerRequestId: input.providerRequestId,
        status: "succeeded",
        responseText: input.tracker.responseText,
        responseUsage: usage,
        finishReasons: input.tracker.finishReasons,
        now: input.now(),
      });
      input.resolveCompleted(final);
    } catch (error) {
      const status = input.isAborted() ? "canceled" : "failed";
      const failureCode = input.isAborted()
        ? "client_aborted_stream"
        : "provider_stream_error";
      const usageSource = input.tracker.usage ? "provider" : "provider_missing";
      const redactedResponse = {
        model: input.modelId,
        providerModel: input.providerModel,
        chunkCount: input.tracker.chunkCount,
        finishReasons: input.tracker.finishReasons,
        usage: input.tracker.usage,
        usageSource,
      };

      if (status === "canceled") {
        await markProviderRequestCanceled(this.config.db, {
          providerRequestId: input.providerRequestId,
          failureCode,
          redactedResponse,
          now: input.now(),
        });
      } else {
        await markProviderRequestFailed(this.config.db, {
          providerRequestId: input.providerRequestId,
          failureCode,
          redactedResponse,
          now: input.now(),
        });
      }
      await completeUserModelRequestLog(this.config.db, {
        providerRequestId: input.providerRequestId,
        status,
        responseText: input.tracker.responseText,
        responseUsage: input.tracker.usage,
        finishReasons: input.tracker.finishReasons,
        failureCode,
        now: input.now(),
      });

      input.resolveCompleted({
        status,
        failureCode,
        usage: input.tracker.usage,
        usageSource,
      });
      throw error;
    }
  }
}

class StreamTracker {
  chunkCount = 0;
  externalRequestId: string | null = null;
  usage: Record<string, unknown> | null = null;
  readonly finishReasons: string[] = [];
  responseText = "";

  observe(chunk: TextGatewayChatCompletionChunk) {
    this.chunkCount += 1;
    if (chunk.id) {
      this.externalRequestId = chunk.id;
    }
    if (chunk.usage) {
      this.usage = chunk.usage as Record<string, unknown>;
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta?.content;
      if (typeof delta === "string") {
        this.responseText += delta;
      } else if (Array.isArray(delta)) {
        for (const part of delta) {
          if (
            part &&
            typeof part === "object" &&
            "type" in part &&
            (part as { type?: string }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            this.responseText += (part as { text: string }).text;
          }
        }
      }
      if (choice.finish_reason) {
        this.finishReasons.push(choice.finish_reason);
      }
    }
  }
}

function prepareProviderChatCompletionRequest(
  request: TextGatewayChatCompletionRequest,
  providerModel: string,
): TextGatewayChatCompletionRequest {
  return {
    ...request,
    model: providerModel,
    stream: true,
    stream_options: {
      ...request.stream_options,
      include_usage: true,
    },
  };
}

function extractRequestText(messages: TextGatewayChatCompletionRequest["messages"]) {
  return messages
    .map((message) => {
      const role = typeof message.role === "string" ? message.role : "unknown";
      const content = extractMessageContentText(message.content);
      return content ? `[${role}]\n${content}` : `[${role}]`;
    })
    .join("\n\n")
    .trim();
}

function extractMessageContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if ("text" in part && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
      if (
        "type" in part &&
        (part as { type?: string }).type === "input_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
