import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
});
