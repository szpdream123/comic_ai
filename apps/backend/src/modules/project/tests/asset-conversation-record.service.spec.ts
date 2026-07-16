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
    assert.match(capturedSql, /field\.key IN \('id',[\s\S]*'thumbnailUrl', 'duration'\)/);
    assert.match(capturedSql, /field\.key IN \('assetTab', 'selectedAssetId', 'selectedAssetName', 'selectedStoryboardId', 'storyboardId'\)/);
    assert.match(capturedSql, /field\.key IN \('failureCode', 'displayMessage', 'providerMessage', 'errorMessage', 'noticeType'\)/);
  });
});
