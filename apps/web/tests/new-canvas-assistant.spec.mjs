import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCanvasAssistantRequest,
  sanitizeCanvasAssistantSessions,
} from "../new-canvas/src/loomic-shell/canvas-assistant.js";
import { creatorApi } from "../src/shared/creator-api.js";

const chatSidebarSource = await readFile(new URL("../new-canvas/src/loomic-shell/ChatSidebar.jsx", import.meta.url), "utf8");
const shellSource = await readFile(new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");

test("assistant request construction does not expose deprecated local image attachments", () => {
  const request = buildCanvasAssistantRequest({
    attachments: [{
      name: "hero.png",
      type: "image/png",
      dataURL: "data:image/png;base64,SECRET",
      blob: "blob:http://localhost/SECRET",
      file: { bytes: "SECRET" },
    }],
  }, {
    messages: [{ role: "user", text: "调整角色一致性" }],
    selectedElements: [{
      id: "node-1",
      type: "image",
      dataUrl: "data:image/png;base64,SECRET",
      customData: { type: "image-generator", title: "主角", prompt: "稳定服装", privateData: "SECRET" },
    }],
  });

  assert.deepEqual(request, {
    messages: [{ role: "user", text: "调整角色一致性" }],
    selectedElements: [{ id: "node-1", type: "image-generator", title: "主角", prompt: "稳定服装" }],
    attachments: [],
  });
  assert.doesNotMatch(JSON.stringify(request), /data:image|blob:http|SECRET|privateData|bytes/);
});

test("assistant request keeps the backend vision block explicit", () => {
  const request = buildCanvasAssistantRequest({ text: "分析图片", attachments: [{ name: "hero.png" }] }, {
    messages: [{ role: "user", text: "分析图片" }],
  });
  assert.deepEqual(request.attachments, []);
  assert.equal(Object.prototype.hasOwnProperty.call(request, "images"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request, "imageUrls"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request, "storageObjectIds"), false);
});

test("assistant request does not synthesize a user message for attachment-only input", () => {
  assert.deepEqual(buildCanvasAssistantRequest({
    attachments: [{ name: "hero.png", type: "image/png", dataURL: "data:image/png;base64,SECRET" }],
  }), {
    messages: [],
    selectedElements: [],
    attachments: [],
  });
});

test("assistant session migration removes legacy attachments and binary preview fields", () => {
  const sessions = sanitizeCanvasAssistantSessions([{
    id: "session-1",
    title: "旧图片对话",
    createdAt: 1,
    privateData: "SECRET",
    messages: [{
      id: "message-1",
      role: "user",
      text: "请继续",
      createdAt: 2,
      attachments: [{ name: "hero.png", dataURL: "data:image/png;base64,SECRET" }],
      dataURL: "data:image/png;base64,SECRET",
      blob: "blob:http://localhost/SECRET",
      file: { bytes: "SECRET" },
    }, {
      id: "message-2",
      role: "user",
      text: "",
      attachments: [{ name: "only-image.png", dataURL: "data:image/png;base64,SECRET" }],
    }],
  }]);

  assert.deepEqual(sessions, [{
    id: "session-1",
    title: "旧图片对话",
    createdAt: 1,
    messages: [{ id: "message-1", role: "user", text: "请继续", createdAt: 2 }],
  }]);
  assert.doesNotMatch(JSON.stringify(sessions), /attachments|data:image|blob:http|SECRET|bytes/);
});

test("creator api posts assistant context to the authenticated endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify({
      data: { message: { role: "assistant", text: "真实网关回复" } },
      requestId: "request-id",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const input = { messages: [{ role: "user", text: "继续" }], selectedElements: [], attachments: [] };
    assert.deepEqual(await creatorApi.sendNewCanvasAssistantMessage(input), { message: { role: "assistant", text: "真实网关回复" } });
    assert.equal(calls[0][0], "/api/creator/new-canvas/assistant");
    assert.equal(calls[0][1].method, "POST");
    assert.deepEqual(JSON.parse(calls[0][1].body), input);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat UI wires persisted user, assistant, loading, and error states without a fake response", () => {
  assert.match(chatSidebarSource, /role: "assistant"/);
  assert.match(chatSidebarSource, /status: "loading"/);
  assert.match(chatSidebarSource, /status: "error"/);
  assert.match(chatSidebarSource, /上次请求已中断，请重新发送/);
  assert.match(chatSidebarSource, /updateMessage\(pendingMessage\.id/);
  assert.match(chatSidebarSource, /localStorage\.setItem\(storageKey/);
  assert.match(chatSidebarSource, /sanitizeCanvasAssistantSessions\(sessions\)/);
  assert.doesNotMatch(chatSidebarSource, /ImagePlus|readImage|readAsDataURL|clipboardData|dataTransfer\.files|type="file"|添加图片/);
  assert.doesNotMatch(chatSidebarSource, /message\.attachments|attachment\.dataURL/);
  assert.doesNotMatch(chatSidebarSource, /模拟回复|假回复|mock response/i);
  assert.match(shellSource, /onSend=\{onChatSend \?\? onLocalChatSend\}/);
  assert.match(mainSource, /sendNewCanvasAssistantMessage\(buildCanvasAssistantRequest\(message, context\)\)/);
});
