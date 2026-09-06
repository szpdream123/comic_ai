import type { SqlDatabase } from "../shared/db/sql.ts";
import type { CanvasAgentContextService } from "./canvas-agent-context.service.ts";
import type { CanvasAgentToolExecutionContext } from "./canvas-agent-tool.registry.ts";
import { CanvasAgentToolRegistry } from "./canvas-agent-tool.registry.ts";

const MAX_ARTIFACTS = 40;
const FILE_GRANT_PURPOSE = "generation_reference";

type AuthorizedArtifact = {
  generationTaskId: string;
  storageObjectId: string;
  mediaKind: "image" | "video" | "audio";
  contentType: string;
};

export function registerFreeConversationArtifactTools(
  registry: CanvasAgentToolRegistry,
  deps: { db: SqlDatabase; context: CanvasAgentContextService },
) {
  registry.register({
    id: "creative.artifacts",
    description: "List completed generated media that is authorized for reuse in this free conversation.",
    effect: "read",
    requiredCapability: "canvas:run",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_input, context) => {
      assertFreeConversationContext(context);
      return {
        status: "succeeded",
        output: { artifacts: await listAuthorizedArtifacts(deps.db, context) },
      };
    },
  });

  registry.register({
    id: "creative.reference",
    description: "Authorize one completed generated media artifact from this free conversation as a generation reference.",
    effect: "memory_write",
    requiredCapability: "canvas:run",
    inputSchema: {
      type: "object",
      properties: { storageObjectId: { type: "string", minLength: 1 } },
      required: ["storageObjectId"],
      additionalProperties: false,
    },
    execute: async (input, context) => {
      assertFreeConversationContext(context);
      const storageObjectId = String(input.storageObjectId ?? "").trim();
      if (!isStorageObjectId(storageObjectId)) throw new Error("canvas_agent_free_conversation_artifact_invalid");
      const artifact = (await listAuthorizedArtifacts(deps.db, context, storageObjectId))[0];
      if (!artifact) throw new Error("canvas_agent_free_conversation_artifact_not_found");

      const now = new Date();
      const activeGrants = await deps.context.listFileGrants({
        canvasId: context.canvasId,
        conversationId: context.conversationId,
        actor: context.actor,
        now,
      });
      const existingGrant = activeGrants.find((grant) => grant.storageObjectId === artifact.storageObjectId);
      const fileGrantId = existingGrant?.id ?? (await deps.context.createFileGrant({
        canvasId: context.canvasId,
        conversationId: context.conversationId,
        storageObjectId: artifact.storageObjectId,
        purpose: FILE_GRANT_PURPOSE,
        actor: context.actor,
        now,
        expiresAt: new Date(now.getTime() + 23 * 60 * 60_000),
      })).id;

      return {
        status: "succeeded",
        output: { fileGrantId, ...artifact },
      };
    },
  });
  return registry;
}

async function listAuthorizedArtifacts(
  db: SqlDatabase,
  context: CanvasAgentToolExecutionContext,
  storageObjectId?: string,
): Promise<AuthorizedArtifact[]> {
  const result = await db.query<AuthorizedArtifact>(`
    SELECT snapshot.task_id AS "generationTaskId",
           storage.id AS "storageObjectId",
           COALESCE(NULLIF(asset.value->>'mediaKind', ''), snapshot.media_type)::text AS "mediaKind",
           storage.content_type AS "contentType"
    FROM ai_generation_task_snapshots snapshot
    JOIN tasks generation_task
      ON generation_task.id=snapshot.task_id AND generation_task.status='succeeded'
    JOIN canvas_agent_conversations conversation
      ON conversation.id=snapshot.target_id
        AND conversation.canvas_id=snapshot.canvas_project_id
        AND conversation.owner_user_id=snapshot.user_id
        AND conversation.deleted_at IS NULL
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snapshot.result_assets_json, '[]'::jsonb)) AS asset(value)
    JOIN storage_objects storage
      ON storage.id=CASE
        WHEN asset.value->>'storageObjectId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (asset.value->>'storageObjectId')::uuid
        ELSE NULL
      END
    WHERE snapshot.status='succeeded'
      AND snapshot.target_type='canvas_agent_conversation'
      AND snapshot.canvas_project_id=$1
      AND snapshot.target_id=$2
      AND snapshot.user_id=$3
      AND conversation.actor_team_member_id IS NOT DISTINCT FROM $4
      AND storage.canvas_project_id=$1
      AND storage.created_by_user_id=$3
      AND storage.status='available'
      AND storage.deleted_at IS NULL
      AND COALESCE(NULLIF(asset.value->>'mediaKind', ''), snapshot.media_type) IN ('image','video','audio')
      AND ($5::uuid IS NULL OR storage.id=$5)
    ORDER BY snapshot.created_at DESC,snapshot.task_id DESC
    LIMIT ${MAX_ARTIFACTS}
  `, [
    context.canvasId,
    context.conversationId,
    context.actor.ownerUserId,
    context.actor.actorTeamMemberId ?? null,
    storageObjectId || null,
  ]);
  return result.rows;
}

function assertFreeConversationContext(context: CanvasAgentToolExecutionContext) {
  if (context.capabilityProfile !== "media_generation_only") {
    throw new Error("canvas_agent_free_conversation_tool_not_allowed");
  }
  if (!context.actor.capabilities.has("canvas:run")) {
    throw new Error("canvas_agent_forbidden");
  }
}

function isStorageObjectId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
