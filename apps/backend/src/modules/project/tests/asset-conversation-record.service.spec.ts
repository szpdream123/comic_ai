import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import { listAssetConversationEntrySummaries } from "../asset-conversation-record.service.ts";

describe("asset conversation history summaries", () => {
  it("loads only the latest 10 conversation turns and keeps them in chronological order", () => {
    const source = readFileSync(
      new URL("../asset-conversation-record.service.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /recent_turn_order AS \([\s\S]*ORDER BY order_created_at DESC, turn_key DESC[\s\S]*LIMIT 10/,
    );
    assert.match(
      source,
      /SELECT\s+recent_turn_order\.turn_key,\s+recent_turn_order\.order_created_at,[\s\S]*FROM recent_turn_order[\s\S]*ORDER BY recent_turn_order\.order_created_at ASC, recent_turn_order\.turn_key ASC/,
    );
  });

  it("projects nested conversation payloads before they leave PostgreSQL", async () => {
    let capturedSql = "";
    const db: SqlDatabase = {
      async query<T>(sql: string) {
        capturedSql = sql;
        return { rows: [] as T[] };
      },
    };

    await listAssetConversationEntrySummaries(db, {
      thread: {
        threadId: "thread-1",
        projectId: "project-1",
        episodeId: "episode-1",
        assetId: "asset-1",
        mediaMode: "image",
        latestMessageAt: new Date("2026-07-16T00:00:00.000Z"),
        createdByUserId: null,
        createdAt: new Date("2026-07-16T00:00:00.000Z"),
        updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      },
    });

    assert.match(capturedSql, /jsonb_array_elements/);
    assert.match(capturedSql, /jsonb_object_agg/);
    assert.match(capturedSql, /field\.key IN \('id',[\s\S]*'thumbnailUrl',[\s\S]*'duration',[\s\S]*'originalName', 'isGenerationStyleReference'\)/);
    assert.match(capturedSql, /field\.key IN \('assetTab', 'selectedAssetId', 'selectedAssetName', 'selectedStoryboardId', 'storyboardId'\)/);
    assert.match(capturedSql, /field\.key IN \('failureCode', 'displayMessage', 'providerMessage', 'errorMessage', 'noticeType'\)/);
    assert.match(capturedSql, /returnedAt/);
    assert.match(capturedSql, /completedAt/);
  });

  it("returns only the configured display name for conversation models", async () => {
    let queryCount = 0;
    const db: SqlDatabase = {
      async query<T>() {
        queryCount += 1;
        if (queryCount === 1) {
          return { rows: [{
            turn_key: "turn-1",
            order_created_at: new Date("2026-07-16T00:00:00.000Z"),
            asset_id: "asset-1",
            media_kind: "image",
            prompt_preview: "角色图",
            quick_reference_items: [],
            attachment_items: [],
            mention_references: [],
            generated_audio_items: [],
            fixed_images: [],
            fixed_videos: [],
            selection_context: null,
            task_id: "task-1",
            status: "completed",
            created_at: "2026-07-16T00:00:00.000Z",
            returned_at: null,
            selected_model_id: "gpt-image-2",
            model_label: "gpt-image-2",
            style_label: null,
            skill_id: null,
            aspect_ratio: null,
            resolution: null,
            credit_cost: null,
            failure_code: null,
            failure: null,
            notice_type: null,
          }] as T[] };
        }
        return { rows: [{ model_code: "gpt-image-2", display_name: "Image-2(优越)" }] as T[] };
      },
    };

    const entries = await listAssetConversationEntrySummaries(db, {
      thread: {
        threadId: "thread-1",
        projectId: "project-1",
        episodeId: "episode-1",
        assetId: "asset-1",
        mediaMode: "image",
        latestMessageAt: new Date("2026-07-16T00:00:00.000Z"),
        createdByUserId: null,
        createdAt: new Date("2026-07-16T00:00:00.000Z"),
        updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      },
    });

    assert.equal(entries[0]?.modelLabel, "Image-2(优越)");
    assert.equal(Object.hasOwn(entries[0] ?? {}, "selectedModelId"), false);
    assert.equal(JSON.stringify(entries).includes("gpt-image-2"), false);
  });
});
