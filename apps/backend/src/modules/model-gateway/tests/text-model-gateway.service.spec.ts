import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type {
  TextGatewayChatCompletionChunk,
  TextGatewayChatCompletionRequest,
} from "../openai-compatible-text.adapter.ts";
import { TextModelGatewayError } from "../text-model-gateway.errors.ts";
import { TextModelGatewayService } from "../text-model-gateway.service.ts";

describe("text model gateway service", () => {
  it("streams OpenAI-compatible chunks and marks the provider request succeeded", async () => {
    const db = await createMigratedTestDb();
    const adapter = new FakeTextAdapter([
      chunk("chatcmpl-1", "Hello", null),
      {
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1716026400,
        model: "deepseek-chat",
        choices: [],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 3,
          total_tokens: 15,
        },
      } as TextGatewayChatCompletionChunk,
    ]);
    const gateway = createGateway(db, adapter);

    try {
      await seedScope(db);

      const result = await gateway.chat.completions.create(
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "Say hi" }],
          stream: true,
        },
        requestContext("success"),
      );

      const text = [];
      for await (const item of result.stream) {
        text.push(item.choices?.[0]?.delta?.content ?? "");
      }
      const final = await result.completed;

      assert.equal(text.join(""), "Hello");
      assert.equal(adapter.calls[0]?.providerModel, "deepseek-chat");
      assert.equal(adapter.calls[0]?.request.model, "deepseek-chat");
      assert.equal(final.status, "succeeded");

      const stored = await db.query<{
        status: string;
        provider_name: string;
        provider_operation: string;
        payload_redacted_json: Record<string, unknown>;
        response_redacted_json: Record<string, unknown>;
      }>("SELECT * FROM provider_requests WHERE id = $1", [
        result.providerRequestId,
      ]);

      assert.equal(stored.rows[0]?.status, "succeeded");
      assert.equal(stored.rows[0]?.provider_name, "deepseek");
      assert.equal(
        stored.rows[0]?.provider_operation,
        operationNames.llmChatCompletions,
      );
      assert.deepEqual(stored.rows[0]?.payload_redacted_json, {
        model: "deepseek-chat",
        providerModel: "deepseek-chat",
        messageCount: 1,
        payloadHash: "payload-hash-success",
        payloadSummary: "summary-success",
      });
      assert.equal(
        stored.rows[0]?.response_redacted_json["usageSource"],
        "provider",
      );
    } finally {
      await db.close();
    }
  });

  it("strictly rejects an unknown model without calling the adapter", async () => {
    const db = await createMigratedTestDb();
    const adapter = new FakeTextAdapter([]);
    const gateway = createGateway(db, adapter);

    try {
      await seedScope(db);

      await assert.rejects(
        gateway.chat.completions.create(
          {
            model: "missing-model",
            messages: [{ role: "user", content: "Say hi" }],
            stream: true,
          },
          requestContext("missing"),
        ),
        (error) =>
          error instanceof TextModelGatewayError &&
          error.code === "model_not_configured",
      );
      assert.equal(adapter.calls.length, 0);
    } finally {
      await db.close();
    }
  });

  it("marks the provider request failed when the upstream stream throws", async () => {
    const db = await createMigratedTestDb();
    const adapter = new ThrowingTextAdapter();
    const gateway = createGateway(db, adapter);

    try {
      await seedScope(db);

      const result = await gateway.chat.completions.create(
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "Say hi" }],
          stream: true,
        },
        requestContext("stream-error"),
      );
      const completedFailure = result.completed.catch((error) => error);

      await assert.rejects(async () => {
        for await (const _chunk of result.stream) {
          // consume stream
        }
      }, /upstream exploded/);

      const completedError = await completedFailure;
      assert.equal(completedError.code, "provider_stream_error");

      const stored = await db.query<{
        status: string;
        failure_code: string | null;
      }>("SELECT status, failure_code FROM provider_requests WHERE id = $1", [
        result.providerRequestId,
      ]);

      assert.equal(stored.rows[0]?.status, "failed");
      assert.equal(stored.rows[0]?.failure_code, "provider_stream_error");
    } finally {
      await db.close();
    }
  });

  it("aborts the upstream stream and marks the provider request canceled", async () => {
    const db = await createMigratedTestDb();
    const adapter = new AbortAwareTextAdapter();
    const gateway = createGateway(db, adapter);

    try {
      await seedScope(db);

      const result = await gateway.chat.completions.create(
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "Say hi" }],
          stream: true,
        },
        requestContext("abort"),
      );
      const completedFailure = result.completed.catch((error) => error);

      const iterator = result.stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      assert.equal(first.done, false);

      result.abort();

      await assert.rejects(iterator.next(), /stream aborted/);
      const completedError = await completedFailure;
      assert.equal(completedError.code, "provider_stream_error");
      assert.equal(adapter.lastSignal?.aborted, true);

      const stored = await db.query<{
        status: string;
        failure_code: string | null;
      }>("SELECT status, failure_code FROM provider_requests WHERE id = $1", [
        result.providerRequestId,
      ]);

      assert.equal(stored.rows[0]?.status, "canceled");
      assert.equal(stored.rows[0]?.failure_code, "client_aborted_stream");
    } finally {
      await db.close();
    }
  });
});

function createGateway(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  adapter: FakeTextAdapter | ThrowingTextAdapter | AbortAwareTextAdapter,
) {
  return new TextModelGatewayService({
    db,
    adapter,
    catalog: [
      {
        id: "deepseek-chat",
        label: "DeepSeek Chat",
        providerName: "deepseek",
        providerModel: "deepseek-chat",
        baseURL: "https://api.deepseek.com",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        enabled: true,
      },
    ],
    env: { DEEPSEEK_API_KEY: "secret" },
    now: () => new Date("2026-06-01T10:00:00.000Z"),
  });
}

function requestContext(suffix: string) {
  return {
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    projectId: null,
    requestKey: `text-${suffix}`,
    requestHash: `request-hash-${suffix}`,
    payloadHash: `payload-hash-${suffix}`,
    payloadSummary: `summary-${suffix}`,
    providerOperation: operationNames.llmChatCompletions,
  };
}

function chunk(
  id: string,
  content: string,
  finishReason: string | null,
): TextGatewayChatCompletionChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created: 1716026400,
    model: "deepseek-chat",
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: finishReason,
      },
    ],
  } as TextGatewayChatCompletionChunk;
}

class FakeTextAdapter {
  readonly calls: Array<{
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }> = [];

  constructor(private readonly chunks: TextGatewayChatCompletionChunk[]) {}

  async createChatCompletionStream(input: {
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }) {
    this.calls.push(input);
    return streamFrom(this.chunks);
  }
}

class ThrowingTextAdapter extends FakeTextAdapter {
  constructor() {
    super([]);
  }

  override async createChatCompletionStream(input: {
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }) {
    this.calls.push(input);
    return throwingStream();
  }
}

class AbortAwareTextAdapter extends FakeTextAdapter {
  lastSignal: AbortSignal | undefined;

  constructor() {
    super([]);
  }

  override async createChatCompletionStream(input: {
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }) {
    this.calls.push(input);
    this.lastSignal = input.signal;
    return abortAwareStream(input.signal);
  }
}

async function* streamFrom(chunks: TextGatewayChatCompletionChunk[]) {
  for (const item of chunks) {
    yield item;
  }
}

async function* throwingStream() {
  yield chunk("chatcmpl-1", "partial", null);
  throw new Error("upstream exploded");
}

async function* abortAwareStream(signal: AbortSignal | undefined) {
  yield chunk("chatcmpl-1", "partial", null);
  if (signal?.aborted) {
    throw new Error("stream aborted");
  }
  yield chunk("chatcmpl-1", "after-abort-check", null);
}

async function seedScope(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Org', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Workspace',
        'active'
      )
    `,
  );
}
