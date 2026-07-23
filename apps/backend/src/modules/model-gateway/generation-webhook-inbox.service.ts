import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { appendGenerationTaskPollRequestedOutboxEvent } from "./generation-outbox.service.ts";
import { readGenerationProviderRouteReferences } from "./generation-model-config-snapshot.ts";

interface WebhookProviderRequestRow {
  provider_request_id: string;
  poll_sequence: number | string;
  task_id: string;
  task_type: string;
  task_status: string;
  workflow_id: string;
  user_id: string;
  input_snapshot_json: Record<string, unknown> | string;
}

export async function recordGenerationProviderWebhook(
  db: SqlDatabase,
  input: {
    providerName: string;
    eventId?: string | null;
    externalRequestId: string;
    payload: Record<string, unknown>;
    signatureVerified: boolean;
    now: Date;
  },
): Promise<{ duplicate: boolean; status: "dispatched" | "unmatched"; taskId?: string }> {
  if (!input.signatureVerified) {
    throw new Error("generation_webhook_signature_invalid");
  }
  const providerName = requiredText(input.providerName, "generation_webhook_provider_required");
  const externalRequestId = requiredText(
    input.externalRequestId,
    "generation_webhook_external_request_id_required",
  );
  const payloadJson = canonicalJson(input.payload);
  const payloadHash = createHash("sha256").update(payloadJson).digest("hex");
  const eventKey = input.eventId?.trim() || payloadHash;

  await db.query("BEGIN");
  try {
    const inserted = await queryOne<{ id: string }>(
      db,
      `
        INSERT INTO provider_webhook_inbox (
          id, provider_name, event_key, external_request_id, payload_hash,
          payload_json, status, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'received', $7)
        ON CONFLICT (provider_name, event_key) DO NOTHING
        RETURNING id
      `,
      [
        randomUUID(),
        providerName,
        eventKey,
        externalRequestId,
        payloadHash,
        payloadJson,
        input.now,
      ],
    );
    if (!inserted) {
      const existing = await queryOne<{ status: "dispatched" | "unmatched"; task_id: string | null }>(
        db,
        `
          SELECT inbox.status, request.task_id
          FROM provider_webhook_inbox inbox
          LEFT JOIN provider_requests request
            ON request.provider_name = inbox.provider_name
           AND request.external_request_id = inbox.external_request_id
          WHERE inbox.provider_name = $1
            AND inbox.event_key = $2
          LIMIT 1
        `,
        [providerName, eventKey],
      );
      await db.query("COMMIT");
      return {
        duplicate: true,
        status: existing?.status === "dispatched" ? "dispatched" : "unmatched",
        ...(existing?.task_id ? { taskId: existing.task_id } : {}),
      };
    }

    const request = await queryOne<WebhookProviderRequestRow>(
      db,
      `
        SELECT
          request.id AS provider_request_id,
          request.poll_sequence,
          task.id AS task_id,
          task.task_type,
          task.status AS task_status,
          task.workflow_id,
          COALESCE(workflow.created_by_user_id, project.owner_user_id) AS user_id,
          task.input_snapshot_json
        FROM provider_requests request
        JOIN tasks task ON task.id = request.task_id
        JOIN workflows workflow ON workflow.id = task.workflow_id
        JOIN projects project ON project.id = task.project_id
        WHERE request.provider_name = $1
          AND request.external_request_id = $2
          AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
        ORDER BY request.updated_at DESC, request.id DESC
        LIMIT 1
        FOR UPDATE OF request
      `,
      [providerName, externalRequestId],
    );
    if (!request || !["running", "result_unknown"].includes(request.task_status)) {
      await markWebhookInbox(db, {
        providerName,
        eventKey,
        status: "unmatched",
        errorMessage: "generation_webhook_active_request_not_found",
        now: input.now,
      });
      await db.query("COMMIT");
      return { duplicate: false, status: "unmatched" };
    }

    const pollAttempt = Number(request.poll_sequence ?? 0) + 1;
    await db.query(
      `
        UPDATE provider_requests
        SET poll_sequence = $2,
            next_poll_at = NULL,
            response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
              || jsonb_build_object('lastWebhookEventKey', $3::text, 'lastWebhookReceivedAt', $4::timestamptz),
            updated_at = GREATEST(updated_at, $4::timestamptz)
        WHERE id = $1
      `,
      [request.provider_request_id, pollAttempt, eventKey, input.now],
    );
    const snapshot = parseRecord(request.input_snapshot_json);
    const routeReferences = readGenerationProviderRouteReferences(snapshot);
    const mediaType = mediaTypeFromTaskType(request.task_type);
    await appendGenerationTaskPollRequestedOutboxEvent(db, {
      userId: request.user_id,
      workflowId: request.workflow_id,
      taskId: request.task_id,
      kind: mediaType,
      modelCode: readString(snapshot.model) || null,
      providerExecutor: readString(snapshot.providerExecutor) || defaultProviderExecutor(mediaType),
      ...routeReferences,
      pollAttempt,
      availableAt: input.now,
    });
    await db.query(
      "UPDATE tasks SET last_dispatched_at = $2, updated_at = GREATEST(updated_at, $2) WHERE id = $1",
      [request.task_id, input.now],
    );
    await markWebhookInbox(db, {
      providerName,
      eventKey,
      status: "dispatched",
      errorMessage: null,
      now: input.now,
    });
    await db.query("COMMIT");
    return { duplicate: false, status: "dispatched", taskId: request.task_id };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function markWebhookInbox(
  db: SqlDatabase,
  input: {
    providerName: string;
    eventKey: string;
    status: "dispatched" | "unmatched";
    errorMessage: string | null;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE provider_webhook_inbox
      SET status = $3,
          error_message = $4,
          processed_at = $5
      WHERE provider_name = $1
        AND event_key = $2
    `,
    [input.providerName, input.eventKey, input.status, input.errorMessage, input.now],
  );
}

function mediaTypeFromTaskType(taskType: string): "image" | "video" | "audio" {
  if (taskType === "episode_generate_image") return "image";
  if (taskType === "episode_generate_video") return "video";
  if (taskType === "episode_generate_audio") return "audio";
  throw new Error(`generation_webhook_unsupported_task_type:${taskType}`);
}

function defaultProviderExecutor(mediaType: "image" | "video" | "audio") {
  return mediaType === "image"
    ? "gpt-image-2"
    : mediaType === "video" ? "seedance" : "aliyun-bailian-audio";
}

function parseRecord(value: Record<string, unknown> | string) {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: string, code: string) {
  const text = value.trim();
  if (!text) throw new Error(code);
  return text;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
