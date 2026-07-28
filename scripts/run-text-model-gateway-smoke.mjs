import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";
import { OpenAICompatibleTextAdapter } from "../apps/backend/src/modules/model-gateway/openai-compatible-text.adapter.ts";
import {
  AdminBackedTextModelResolver,
} from "../apps/backend/src/modules/canvas-agent/admin-backed-text-model.resolver.ts";
import {
  TextModelGatewayService,
  textModelGatewayOperationNames,
} from "../apps/backend/src/modules/model-gateway/text-model-gateway.service.ts";

const requestedModel = process.env.TEXT_GATEWAY_SMOKE_MODEL?.trim() || "";
const prompt =
  process.env.TEXT_GATEWAY_SMOKE_PROMPT?.trim() ||
  "Reply with exactly one short English word confirming the gateway works.";

loadDotEnvFile(join(process.cwd(), ".env"));

const db = await createDevDb();

try {
  const model = requestedModel || (await db.query(
    `SELECT model_code FROM ai_model_configs
     WHERE status='active' AND media_type='text' AND task_modes_json ? 'text.canvas_agent'
     ORDER BY sort_order,model_code LIMIT 1`,
  )).rows[0]?.model_code;
  if (!model) throw new Error("text_gateway_smoke_model_not_configured");
  const request = {
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    temperature: 0,
    max_tokens: 16,
  };
  const requestHash = hashJson({
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
  });
  const requestKey = `text-gateway-smoke-${randomUUID()}`;
  const gateway = new TextModelGatewayService({
    db,
    adapter: new OpenAICompatibleTextAdapter(),
    resolver: new AdminBackedTextModelResolver(db, { allowFailedCompatibilityProbe: true }),
  });

  const result = await gateway.chat.completions.create(request, {
    projectId: null,
    requestKey,
    requestHash,
    payloadHash: requestHash,
    payloadSummary: "text gateway smoke prompt",
    providerOperation: textModelGatewayOperationNames.chatCompletions,
  });

  let chunkCount = 0;
  let outputCharacters = 0;
  for await (const chunk of result.stream) {
    chunkCount += 1;
    for (const choice of chunk.choices ?? []) {
      outputCharacters += String(choice.delta?.content ?? "").length;
    }
  }

  const final = await result.completed;
  const stored = await db.query(
    `
      SELECT status, provider_name, provider_operation, response_redacted_json
      FROM provider_requests
      WHERE id = $1
    `,
    [result.providerRequestId],
  );
  const row = stored.rows[0];

  if (final.status !== "succeeded" || row?.status !== "succeeded") {
    throw new Error(
      `gateway_smoke_failed:${final.status}:${row?.status ?? "missing_provider_request"}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        model,
        provider: row.provider_name,
        providerOperation: row.provider_operation,
        providerRequestStatus: row.status,
        providerRequestId: result.providerRequestId,
        chunkCount,
        outputCharacters,
        usageSource: final.usageSource,
        usage: final.usage ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Text model gateway smoke failed.");
  if (error && typeof error === "object" && "code" in error) {
    console.error(`code=${error.code}`);
  }
  console.error(`message=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await db.close();
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
