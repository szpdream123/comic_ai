# Text Model Gateway v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend internal `TextModelGatewayService` for OpenAI-compatible streaming chat completions.

**Architecture:** Add a small text gateway stack inside `apps/backend/src/modules/model-gateway`: model catalog resolution, OpenAI-compatible text adapter, provider request lifecycle helpers, and the internal service that wraps streaming chunks and records audit facts. Business services keep building prompts and owning business persistence.

**Tech Stack:** TypeScript ESM, Node test runner, `tsx`, PostgreSQL test schemas, existing `provider_requests`, OpenAI Node SDK.

---

## File Structure

- Modify: `package.json` and `package-lock.json`
  - Add the `openai` runtime dependency.
- Modify: `packages/contracts/domain/operation-names.ts`
  - Add `llmChatCompletions: "llm.chat.completions"` for a shared operation constant.
- Create: `apps/backend/src/modules/model-gateway/text-model-gateway.errors.ts`
  - Typed gateway errors with stable `code` values.
- Create: `apps/backend/src/modules/model-gateway/text-model-catalog.ts`
  - Model catalog entry type, env/default catalog builder, resolver.
- Create: `apps/backend/src/modules/model-gateway/openai-compatible-text.adapter.ts`
  - OpenAI SDK wrapper with injectable client factory for deterministic tests.
- Create: `apps/backend/src/modules/model-gateway/text-model-gateway.service.ts`
  - Internal service exposing `chat.completions.create(request, context)`.
- Modify: `apps/backend/src/modules/model-gateway/provider-request.service.ts`
  - Add narrow lifecycle helpers for text streaming completion/failure/cancel.
- Create tests:
  - `apps/backend/src/modules/model-gateway/tests/text-model-catalog.spec.ts`
  - `apps/backend/src/modules/model-gateway/tests/openai-compatible-text.adapter.spec.ts`
  - `apps/backend/src/modules/model-gateway/tests/provider-request-text-lifecycle.spec.ts`
  - `apps/backend/src/modules/model-gateway/tests/text-model-gateway.service.spec.ts`

## Task 1: Add OpenAI SDK Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

Run:

```bash
npm install openai
```

Expected: `package.json` gains `openai` under `dependencies`, and `package-lock.json` records the package and transitive dependencies.

- [ ] **Step 2: Verify dependency can be resolved**

Run:

```bash
node -e "import('openai').then(() => console.log('openai-ok'))"
```

Expected: prints `openai-ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add openai sdk dependency"
```

## Task 2: Catalog Resolution and Typed Errors

**Files:**
- Create: `apps/backend/src/modules/model-gateway/text-model-gateway.errors.ts`
- Create: `apps/backend/src/modules/model-gateway/text-model-catalog.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/text-model-catalog.spec.ts`

- [ ] **Step 1: Write the failing catalog tests**

Create `apps/backend/src/modules/model-gateway/tests/text-model-catalog.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDefaultTextModelCatalog,
  resolveTextModelCatalogEntry,
} from "../text-model-catalog.ts";
import { TextModelGatewayError } from "../text-model-gateway.errors.ts";

describe("text model catalog", () => {
  it("resolves an enabled model and reads its API key from env", () => {
    const entry = resolveTextModelCatalogEntry(
      [
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
      "deepseek-chat",
      { DEEPSEEK_API_KEY: "secret" },
    );

    assert.equal(entry.id, "deepseek-chat");
    assert.equal(entry.apiKey, "secret");
    assert.equal(entry.providerModel, "deepseek-chat");
  });

  it("strictly rejects an unknown model", () => {
    assert.throws(
      () => resolveTextModelCatalogEntry([], "missing-model", {}),
      (error) =>
        error instanceof TextModelGatewayError &&
        error.code === "model_not_configured",
    );
  });

  it("strictly rejects a disabled model", () => {
    assert.throws(
      () =>
        resolveTextModelCatalogEntry(
          [
            {
              id: "qwen-plus",
              label: "Qwen Plus",
              providerName: "qwen",
              providerModel: "qwen-plus",
              baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
              apiKeyEnv: "DASHSCOPE_API_KEY",
              enabled: false,
            },
          ],
          "qwen-plus",
          { DASHSCOPE_API_KEY: "secret" },
        ),
      (error) =>
        error instanceof TextModelGatewayError &&
        error.code === "model_disabled",
    );
  });

  it("strictly rejects a configured model whose API key is missing", () => {
    assert.throws(
      () =>
        resolveTextModelCatalogEntry(
          [
            {
              id: "qwen-plus",
              label: "Qwen Plus",
              providerName: "qwen",
              providerModel: "qwen-plus",
              baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
              apiKeyEnv: "DASHSCOPE_API_KEY",
              enabled: true,
            },
          ],
          "qwen-plus",
          {},
        ),
      (error) =>
        error instanceof TextModelGatewayError &&
        error.code === "provider_auth_missing",
    );
  });

  it("provides default DeepSeek and Qwen compatible catalog entries", () => {
    const catalog = createDefaultTextModelCatalog();

    assert.deepEqual(
      catalog.map((entry) => entry.id),
      ["deepseek-chat", "qwen-plus"],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/text-model-catalog.spec.ts
```

Expected: FAIL because `text-model-catalog.ts` and `text-model-gateway.errors.ts` do not exist.

- [ ] **Step 3: Implement typed errors**

Create `apps/backend/src/modules/model-gateway/text-model-gateway.errors.ts`:

```ts
export type TextModelGatewayErrorCode =
  | "model_not_configured"
  | "model_disabled"
  | "provider_auth_missing"
  | "provider_request_already_started"
  | "provider_stream_error"
  | "stream_interrupted_before_usage";

export class TextModelGatewayError extends Error {
  constructor(
    readonly code: TextModelGatewayErrorCode,
    message = code,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TextModelGatewayError";
  }
}
```

- [ ] **Step 4: Implement catalog**

Create `apps/backend/src/modules/model-gateway/text-model-catalog.ts`:

```ts
import { TextModelGatewayError } from "./text-model-gateway.errors.ts";

export interface TextModelCatalogEntry {
  id: string;
  label: string;
  providerName: string;
  providerModel: string;
  baseURL: string;
  apiKeyEnv: string;
  enabled: boolean;
}

export interface ResolvedTextModelCatalogEntry
  extends TextModelCatalogEntry {
  apiKey: string;
}

export function createDefaultTextModelCatalog(): TextModelCatalogEntry[] {
  return [
    {
      id: "deepseek-chat",
      label: "DeepSeek Chat",
      providerName: "deepseek",
      providerModel: "deepseek-chat",
      baseURL: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      enabled: true,
    },
    {
      id: "qwen-plus",
      label: "Qwen Plus",
      providerName: "qwen",
      providerModel: "qwen-plus",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKeyEnv: "DASHSCOPE_API_KEY",
      enabled: true,
    },
  ];
}

export function resolveTextModelCatalogEntry(
  catalog: readonly TextModelCatalogEntry[],
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedTextModelCatalogEntry {
  const normalizedModel = model.trim();
  const entry = catalog.find((candidate) => candidate.id === normalizedModel);

  if (!entry) {
    throw new TextModelGatewayError("model_not_configured");
  }

  if (!entry.enabled) {
    throw new TextModelGatewayError("model_disabled");
  }

  const apiKey = env[entry.apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new TextModelGatewayError("provider_auth_missing");
  }

  return {
    ...entry,
    apiKey,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/text-model-catalog.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/model-gateway/text-model-gateway.errors.ts apps/backend/src/modules/model-gateway/text-model-catalog.ts apps/backend/src/modules/model-gateway/tests/text-model-catalog.spec.ts
git commit -m "feat: add text model catalog"
```

## Task 3: OpenAI-Compatible Text Adapter

**Files:**
- Create: `apps/backend/src/modules/model-gateway/openai-compatible-text.adapter.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/openai-compatible-text.adapter.spec.ts`

- [ ] **Step 1: Write the failing adapter test**

Create `apps/backend/src/modules/model-gateway/tests/openai-compatible-text.adapter.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OpenAICompatibleTextAdapter } from "../openai-compatible-text.adapter.ts";

describe("openai compatible text adapter", () => {
  it("creates an OpenAI-compatible streaming chat completion with provider model", async () => {
    let capturedConfig: unknown;
    let capturedRequest: unknown;

    const adapter = new OpenAICompatibleTextAdapter({
      clientFactory: (config) => {
        capturedConfig = config;
        return {
          chat: {
            completions: {
              create: async (request, options) => {
                capturedRequest = request;
                assert.equal(options?.signal instanceof AbortSignal, true);
                return streamFrom([
                  {
                    id: "chatcmpl-test",
                    object: "chat.completion.chunk",
                    created: 1716026400,
                    model: "deepseek-chat",
                    choices: [
                      {
                        index: 0,
                        delta: { content: "hello" },
                        finish_reason: null,
                      },
                    ],
                  },
                ]);
              },
            },
          },
        };
      },
    });

    const stream = await adapter.createChatCompletionStream({
      baseURL: "https://api.deepseek.com",
      apiKey: "secret",
      providerModel: "deepseek-chat",
      request: {
        model: "catalog-id",
        messages: [{ role: "user", content: "Say hi" }],
        stream: true,
      },
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    assert.deepEqual(capturedConfig, {
      baseURL: "https://api.deepseek.com",
      apiKey: "secret",
    });
    assert.deepEqual(capturedRequest, {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Say hi" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    assert.equal(chunks[0]?.choices?.[0]?.delta?.content, "hello");
  });
});

async function* streamFrom(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/openai-compatible-text.adapter.spec.ts
```

Expected: FAIL because `openai-compatible-text.adapter.ts` does not exist.

- [ ] **Step 3: Implement adapter**

Create `apps/backend/src/modules/model-gateway/openai-compatible-text.adapter.ts`:

```ts
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

export type TextGatewayChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessageParam[];
  stream: true;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  stream_options?: { include_usage?: boolean };
};

export type TextGatewayChatCompletionChunk = ChatCompletionChunk;

export interface OpenAICompatibleClientConfig {
  baseURL: string;
  apiKey: string;
}

export interface OpenAICompatibleClient {
  chat: {
    completions: {
      create(
        request: TextGatewayChatCompletionRequest,
        options?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<TextGatewayChatCompletionChunk>>;
    };
  };
}

export class OpenAICompatibleTextAdapter {
  constructor(
    private readonly config: {
      clientFactory?: (
        config: OpenAICompatibleClientConfig,
      ) => OpenAICompatibleClient;
    } = {},
  ) {}

  async createChatCompletionStream(input: {
    baseURL: string;
    apiKey: string;
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }): Promise<AsyncIterable<TextGatewayChatCompletionChunk>> {
    const client = this.createClient({
      baseURL: input.baseURL,
      apiKey: input.apiKey,
    });

    return client.chat.completions.create(
      {
        ...input.request,
        model: input.providerModel,
        stream: true,
        stream_options: {
          ...input.request.stream_options,
          include_usage: true,
        },
      },
      { signal: input.signal },
    );
  }

  private createClient(config: OpenAICompatibleClientConfig) {
    if (this.config.clientFactory) {
      return this.config.clientFactory(config);
    }

    return new OpenAI(config) as unknown as OpenAICompatibleClient;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/openai-compatible-text.adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/model-gateway/openai-compatible-text.adapter.ts apps/backend/src/modules/model-gateway/tests/openai-compatible-text.adapter.spec.ts
git commit -m "feat: add openai compatible text adapter"
```

## Task 4: Provider Request Text Lifecycle Helpers

**Files:**
- Modify: `apps/backend/src/modules/model-gateway/provider-request.service.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/provider-request-text-lifecycle.spec.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `apps/backend/src/modules/model-gateway/tests/provider-request-text-lifecycle.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
} from "../provider-request.service.ts";

describe("provider request text lifecycle", () => {
  it("marks a streaming provider request as succeeded with redacted usage", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createStartedRequest(db, "success");

      const completed = await markProviderRequestSucceeded(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "chatcmpl-1",
        redactedResponse: {
          model: "deepseek-chat",
          chunkCount: 2,
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
          },
        },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(completed.status, "succeeded");
      assert.equal(completed.externalRequestId, "chatcmpl-1");
      assert.equal(completed.redactedResponse?.["chunkCount"], 2);
    } finally {
      await db.close();
    }
  });

  it("marks a streaming provider request as failed with a failure code", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createStartedRequest(db, "failed");

      const failed = await markProviderRequestFailed(db, {
        providerRequestId: prepared.request.id,
        failureCode: "provider_stream_error",
        redactedResponse: { model: "deepseek-chat", chunkCount: 1 },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(failed.status, "failed");
      assert.equal(failed.failureCode, "provider_stream_error");
    } finally {
      await db.close();
    }
  });

  it("marks an aborted streaming provider request as canceled", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createStartedRequest(db, "canceled");

      const canceled = await markProviderRequestCanceled(db, {
        providerRequestId: prepared.request.id,
        failureCode: "client_aborted_stream",
        redactedResponse: { model: "qwen-plus", chunkCount: 0 },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(canceled.status, "canceled");
      assert.equal(canceled.failureCode, "client_aborted_stream");
    } finally {
      await db.close();
    }
  });
});

async function createStartedRequest(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  suffix: string,
) {
  const prepared = await createOrReuseProviderRequest(db, providerInput(suffix));
  await markExternalSubmissionStarted(db, {
    providerRequestId: prepared.request.id,
    externalRequestId: null,
    now: new Date("2026-06-01T10:01:00.000Z"),
  });
  return prepared;
}

function providerInput(suffix: string) {
  return {
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    projectId: null,
    providerName: "deepseek",
    providerOperation: "llm.chat.completions",
    requestKey: `text-${suffix}`,
    requestHash: `request-hash-${suffix}`,
    payloadRef: `text-gateway://${suffix}`,
    payloadHash: `payload-hash-${suffix}`,
    redactedPayload: { model: "deepseek-chat", messageCount: 1 },
    createdByUserId: null,
    now: new Date("2026-06-01T10:00:00.000Z"),
  };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/provider-request-text-lifecycle.spec.ts
```

Expected: FAIL because the lifecycle helper exports do not exist.

- [ ] **Step 3: Add lifecycle helpers**

Modify `apps/backend/src/modules/model-gateway/provider-request.service.ts` by exporting these functions after `markProviderRequestResultUnknown`:

```ts
export async function markProviderRequestSucceeded(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  return updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "succeeded",
    externalRequestId: input.externalRequestId,
    redactedResponse: input.redactedResponse,
    failureCode: null,
    now: input.now,
  });
}

export async function markProviderRequestFailed(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    failureCode: string;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  return updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "failed",
    externalRequestId: null,
    redactedResponse: input.redactedResponse,
    failureCode: input.failureCode,
    now: input.now,
  });
}

export async function markProviderRequestCanceled(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    failureCode: string;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  return updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "canceled",
    externalRequestId: null,
    redactedResponse: input.redactedResponse,
    failureCode: input.failureCode,
    now: input.now,
  });
}
```

Add this private helper before `findProviderRequestByKey`:

```ts
async function updateProviderRequestTerminalStatus(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    status: Extract<
      ProviderRequestStatus,
      "succeeded" | "failed" | "canceled"
    >;
    externalRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    failureCode: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = $2,
          external_request_id = COALESCE($3, external_request_id),
          response_redacted_json = $4::jsonb,
          failure_code = $5,
          updated_at = $6
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.status,
      input.externalRequestId,
      JSON.stringify(input.redactedResponse),
      input.failureCode,
      input.now,
    ],
  );

  return providerRequestFromRow(row!);
}
```

- [ ] **Step 4: Run lifecycle and existing provider tests**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/provider-request-text-lifecycle.spec.ts apps/backend/src/modules/model-gateway/tests/no-blind-retry-after-external-start.spec.ts apps/backend/src/modules/model-gateway/tests/crash-after-external-start.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/model-gateway/provider-request.service.ts apps/backend/src/modules/model-gateway/tests/provider-request-text-lifecycle.spec.ts
git commit -m "feat: add text provider request lifecycle"
```

## Task 5: Internal TextModelGatewayService

**Files:**
- Create: `apps/backend/src/modules/model-gateway/text-model-gateway.service.ts`
- Modify: `packages/contracts/domain/operation-names.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/text-model-gateway.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/backend/src/modules/model-gateway/tests/text-model-gateway.service.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type {
  TextGatewayChatCompletionRequest,
  TextGatewayChatCompletionChunk,
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
      },
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

      await assert.rejects(async () => {
        for await (const _chunk of result.stream) {
          // consume stream
        }
      }, /upstream exploded/);
      await assert.rejects(result.completed);

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

      const iterator = result.stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      assert.equal(first.done, false);

      result.abort();

      await assert.rejects(iterator.next(), /stream aborted/);
      await assert.rejects(result.completed);
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
  }> = [];

  constructor(private readonly chunks: TextGatewayChatCompletionChunk[]) {}

  async createChatCompletionStream(input: {
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/text-model-gateway.service.spec.ts
```

Expected: FAIL because `TextModelGatewayService` and `operationNames.llmChatCompletions` do not exist.

- [ ] **Step 3: Add operation name**

Modify `packages/contracts/domain/operation-names.ts`:

```ts
export const operationNames = {
  projectCreate: "project.create",
  scriptParse: "script.parse",
  shotsSplit: "shots.split",
  shotImageGenerate: "shot.image.generate",
  shotVideoGenerate: "shot.video.generate",
  episodeImageGenerate: "episode.image.generate",
  episodeVideoGenerate: "episode.video.generate",
  calibrationGenerate: "calibration.generate",
  calibrationPass: "calibration.pass",
  calibrationSkip: "calibration.skip",
  calibrationOverride: "calibration.override",
  exportCreate: "export.create",
  billingCreateOrder: "billing.create_order",
  billingCreatePaymentIntent: "billing.create_payment_intent",
  billingRequestRefund: "billing.request_refund",
  opsManualSettleTask: "ops.manual_settle_task",
  opsRetryTask: "ops.retry_task",
  opsMarkPaymentRiskReviewed: "ops.mark_payment_risk_reviewed",
  opsRepairPaidWithoutCredit: "ops.repair_paid_without_credit",
  llmChatCompletions: "llm.chat.completions",
} as const;
```

- [ ] **Step 4: Implement service**

Create `apps/backend/src/modules/model-gateway/text-model-gateway.service.ts`:

```ts
import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import type {
  OpenAICompatibleTextAdapter,
  TextGatewayChatCompletionChunk,
  TextGatewayChatCompletionRequest,
} from "./openai-compatible-text.adapter.ts";
import {
  type TextModelCatalogEntry,
  createDefaultTextModelCatalog,
  resolveTextModelCatalogEntry,
} from "./text-model-catalog.ts";
import { TextModelGatewayError } from "./text-model-gateway.errors.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
} from "./provider-request.service.ts";

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
  providerOperation: typeof operationNames.llmChatCompletions;
}

export interface TextGatewayFinalUsage {
  status: "succeeded";
  usage: Record<string, unknown> | null;
  usageSource: "provider" | "provider_missing";
}

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
    let rejectCompleted!: (reason: unknown) => void;
    const completed = new Promise<TextGatewayFinalUsage>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    const stream = this.wrapStream({
      stream: upstreamStream,
      providerRequestId: started.id,
      modelId: model.id,
      providerModel: model.providerModel,
      tracker,
      isAborted: () => aborted,
      resolveCompleted,
      rejectCompleted,
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
    rejectCompleted: (reason: unknown) => void;
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
      const failure = new TextModelGatewayError(
        "provider_stream_error",
        "provider_stream_error",
        error,
      );
      const redactedResponse = {
        model: input.modelId,
        providerModel: input.providerModel,
        chunkCount: input.tracker.chunkCount,
        finishReasons: input.tracker.finishReasons,
        usage: input.tracker.usage,
        usageSource: input.tracker.usage ? "provider" : "provider_missing",
      };
      if (input.isAborted()) {
        await markProviderRequestCanceled(this.config.db, {
          providerRequestId: input.providerRequestId,
          failureCode: "client_aborted_stream",
          redactedResponse,
          now: input.now(),
        });
      } else {
        await markProviderRequestFailed(this.config.db, {
          providerRequestId: input.providerRequestId,
          failureCode: "provider_stream_error",
          redactedResponse,
          now: input.now(),
        });
      }
      input.rejectCompleted(failure);
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
```

- [ ] **Step 5: Run service tests**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests/text-model-gateway.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/domain/operation-names.ts apps/backend/src/modules/model-gateway/text-model-gateway.service.ts apps/backend/src/modules/model-gateway/tests/text-model-gateway.service.spec.ts
git commit -m "feat: add internal text model gateway service"
```

## Task 6: Integration Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted gateway suite**

Run:

```bash
npm test -- apps/backend/src/modules/model-gateway/tests
```

Expected: PASS for existing provider gateway tests and new text gateway tests.

- [ ] **Step 2: Run contracts consistency test**

Run:

```bash
npm test -- packages/contracts apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts
```

Expected: PASS after adding `operationNames.llmChatCompletions`.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git diff --stat
git diff --check
```

Expected: only dependency, contract operation name, model-gateway source, and model-gateway tests changed; no whitespace errors.

- [ ] **Step 4: Final commit if any verification-only edits were needed**

If Task 6 required fixes, commit them:

```bash
git add package.json package-lock.json packages/contracts/domain/operation-names.ts apps/backend/src/modules/model-gateway
git commit -m "test: verify text model gateway"
```

Expected: no extra commit if Task 1-5 already covered all changes.

## Self-Review

Spec coverage:

- Internal service only: Task 5 creates `TextModelGatewayService`; no public HTTP edge is added.
- OpenAI-compatible format: Task 3 maps OpenAI-compatible requests to provider model and keeps `stream: true`.
- Streaming shape: Task 3 and Task 5 expose `AsyncIterable` chunks.
- Abort behavior: Task 5 sends an `AbortSignal` to the adapter and verifies canceled status.
- Backend model catalog: Task 2 adds catalog and strict unknown/disabled/auth failures.
- No capabilities: Task 2 catalog type intentionally has no `capabilities`.
- No fallback: no task adds fallback or model switching.
- No full raw storage: Task 5 stores message count, hashes, summary, usage, and chunk facts only.
- Provider request audit: Task 4 adds terminal lifecycle helpers; Task 5 uses create/start/succeeded/failed flow.
- Tests: Tasks 2-6 cover catalog, adapter, lifecycle, service, and targeted integration.

Placeholder scan:

- No placeholder markers or unspecified "handle later" implementation steps are left.
- Each implementation step names exact files and includes concrete code.

Type consistency:

- Request type is `TextGatewayChatCompletionRequest`.
- Chunk type is `TextGatewayChatCompletionChunk`.
- Service result uses `completed`, not `finalize`.
- Operation constant is `operationNames.llmChatCompletions`.
