import assert from "node:assert/strict";
import test from "node:test";

import { formatNamedSseChunk, formatSseDataChunk } from "../phone-auth-dev-server.ts";

test("formatSseDataChunk emits data-only SSE messages for storyboard streaming payloads", () => {
  const chunk = formatSseDataChunk({ type: "script_delta", text: "第" });

  assert.equal(chunk, 'data: {"type":"script_delta","text":"第"}\n\n');
  assert.doesNotMatch(chunk, /^event:/m);
});

test("formatNamedSseChunk preserves explicit SSE event names for legacy consumers", () => {
  const chunk = formatNamedSseChunk("ping", { ts: "2026-06-20T00:00:00.000Z" });

  assert.equal(chunk, 'event: ping\ndata: {"ts":"2026-06-20T00:00:00.000Z"}\n\n');
});
