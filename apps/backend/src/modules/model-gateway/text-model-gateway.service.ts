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

export const textModelGatewayOperationNames = {
  chatCompletions: "llm.chat.completions",
} as const;

export interface TextModelGatewayRequestContext {
  organizationId: string;
  workspaceId?: string | null;
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
      organizationId: context.organizationId,
      workspaceId: context.workspaceId ?? null,
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
      createdByUserId: context.createdByUserId ?? null,
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
    const abortController = new AbortController();
    const upstreamStream = await this.config.adapter.createChatCompletionStream({
      baseURL: model.baseURL,
      apiKey: model.apiKey,
      providerModel: model.providerModel,
      request,
      signal: abortController.signal,
    });
    const tracker = new StreamTracker();
    let aborted = false;
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
      completed,
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

  observe(chunk: TextGatewayChatCompletionChunk) {
    this.chunkCount += 1;
    if (chunk.id) {
      this.externalRequestId = chunk.id;
    }
    if (chunk.usage) {
      this.usage = chunk.usage as Record<string, unknown>;
    }
    for (const choice of chunk.choices ?? []) {
      if (choice.finish_reason) {
        this.finishReasons.push(choice.finish_reason);
      }
    }
  }
}
