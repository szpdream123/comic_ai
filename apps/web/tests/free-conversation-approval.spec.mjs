import assert from "node:assert/strict";
import { test } from "node:test";
import { renderFreeConversationApprovalDetails } from "../src/features/new-canvas/free-conversation-approval.js";
import { renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";
const input = { kind: "video", request: { model: "video-1", prompt: "窗边桂花\n<script>bad()</script>", parameters: { duration: 4 } }, fileGrantIds: ["ref"] };
test("approval details show trusted cost, effective parameters and authorized references with escaped full prompt", () => {
  const html = renderFreeConversationApprovalDetails({ input, quote: { status: "available", model: "video-1", estimatedCredits: 24, parameters: { durationSec: 12, ratio: "16:9" } } }, {
    generationModels: [{ modelCode: "video-1", modelLabel: "创作视频" }], fileGrants: [{ id: "ref", storageObjectId: "image" }],
    messages: [{ attachments: [{ fileGrantId: "ref", kind: "image", name: "主角" }] }],
  });
  for (const text of ["24 积分", "12秒", "16:9", "主角", "创作视频", "窗边桂花", "&lt;script&gt;"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<script>|4秒/);
});
test("missing quote is not a zero price and explicit zero price remains valid", () => {
  assert.match(renderFreeConversationApprovalDetails({ input }, {}), /报价暂不可用/);
  assert.match(renderFreeConversationApprovalDetails({ input, quote: { status: "available", estimatedCredits: 0 } }, {}), /0 积分/);
});
test("unavailable quote disables generation approval but leaves cancel actionable", () => {
  const html = renderCanvasAgentPanel({ canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { taskId: "task", status: "waiting_approval", events: [{ eventType: "approval.requested", event: { approvalId: "ap", stepId: "step", effect: "media_generation", input, quote: { status: "unavailable" } } }] } });
  assert.match(html, /data-agent-action="approve"[^>]*disabled/);
  assert.match(html, /data-agent-action="reject"[^>]*>取消/);
});
