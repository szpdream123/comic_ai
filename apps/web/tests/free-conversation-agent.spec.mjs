import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCanvasAgentController,
  ensureCanvasAgentState,
  normalizeAgentMessage,
  renderCanvasAgentPanel,
} from "../src/features/new-canvas/canvas-agent-panel.js";

test("free conversation preserves creative tool output and renders safe plan, question, and document cards", () => {
  const messages = [
    normalizeAgentMessage({
      id: "plan-1",
      role: "tool",
      content: {
        toolId: "creative.plan",
        output: {
          creative: {
            type: "plan",
            title: "角色设定 <script>alert(1)</script>",
            goal: "先定主角，再制作系列图",
            constraints: "保持水彩风格",
            steps: [{ id: "role", title: "角色设定", status: "completed" }, { id: "images", title: "系列图片", status: "pending" }],
          },
        },
      },
    }),
    normalizeAgentMessage({
      id: "question-1",
      taskId: "creative-task",
      role: "tool",
      content: {
        toolId: "creative.ask",
        output: { creative: { type: "question", id: "style", question: "希望采用哪种画风？", options: ["水彩", "赛博朋克"] } },
      },
    }),
    normalizeAgentMessage({
      id: "document-1",
      role: "tool",
      content: {
        toolId: "creative.document",
        output: { creative: { type: "document", documentId: "outline", title: "第一集大纲", content: "# 开场\n\n主角抵达车站。\n\n<script>bad()</script>", version: 2 } },
      },
    }),
  ];
  assert.equal(messages[0].creative.type, "plan");
  assert.equal(messages[2].creative.version, 2);

  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: { messages, generationModelsStatus: "ready", generationModels: [{ modelCode: "image", mediaType: "image" }] },
  });

  assert.match(html, /canvas-agent-creative-card plan/);
  assert.match(html, /角色设定 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /希望采用哪种画风？/);
  assert.match(html, /data-agent-action="answer-creative-question"/);
  assert.match(html, /第一集大纲/);
  assert.match(html, /版本 2/);
  assert.match(html, /data-agent-action="continue-creative-document"/);
  assert.doesNotMatch(html, /<script>bad\(\)<\/script>/);
  assert.doesNotMatch(html, /已执行/);
});

test("free conversation defaults to Agent and sends each available media preference without forcing a kind", async () => {
  const sent = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        promptDraft: "设计主角并产出一组素材", modelCode: "text-pro", modelsStatus: "ready",
        models: [{ modelCode: "text-pro", modelLabel: "文本创作" }],
      },
    },
    api: {
      async createFreeGenerationConversation() { return { conversation: { id: "creative-conversation" } }; },
      async sendFreeGenerationMessage(_conversationId, input) { sent.push(input); return { task: { id: "creative-task", status: "queued" } }; },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });
  workbench.ui.canvasAgent.generationModelsStatus = "ready";
  workbench.ui.canvasAgent.generationModels = [
    { modelCode: "image-pro", mediaType: "image", enabled: true },
    { modelCode: "video-pro", mediaType: "video", enabled: true },
    { modelCode: "audio-pro", mediaType: "audio", enabled: true },
  ];

  assert.equal(ensureCanvasAgentState(workbench.ui).generationKind, "agent");
  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.deepEqual(sent[0].message.preferredModels, { image: "image-pro", video: "video-pro", audio: "audio-pro" });
  assert.deepEqual(sent[0].message.preferredGenerationParameters, { image: {}, video: {}, audio: {} });
  assert.equal("preferredGenerationKind" in sent[0].message, false);
  controller.dispose();
});

test("Agent mode lets a text-capable request start without a configured media model", async () => {
  const sent = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        promptDraft: "写一份主角角色设定", generationKind: "agent", modelCode: "text-pro", modelsStatus: "ready",
        models: [{ modelCode: "text-pro", modelLabel: "文本创作" }], generationModelsStatus: "ready", generationModels: [],
      },
    },
    api: {
      async createFreeGenerationConversation() { return { conversation: { id: "text-conversation" } }; },
      async sendFreeGenerationMessage(_conversationId, input) { sent.push(input); return { task: { id: "text-task", status: "queued" } }; },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].modelCode, "text-pro");
  assert.deepEqual(sent[0].message.preferredModels, {});
  assert.equal("preferredGenerationKind" in sent[0].message, false);
  controller.dispose();
});

test("free conversation skill buttons select a Chinese tag and question choices interject the paused task", async () => {
  const controls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        taskId: "creative-task", status: "paused",
        messages: [{ taskId: "creative-task", role: "tool", creative: { type: "question", id: "style", question: "请选择画风" } }],
        generationModelsStatus: "ready", generationModels: [{ modelCode: "image-pro", mediaType: "image", enabled: true }],
      },
    },
    api: {
      async controlFreeGenerationTask(taskId, action, input) {
        controls.push({ taskId, action, input });
        return { result: { status: "running" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  const html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /data-agent-action="select-free-conversation-skill" data-skill-id="character-design"/);
  assert.match(html, /series-images/);
  assert.match(html, /image-to-video/);
  await controller.handleAction({ dataset: { agentAction: "select-free-conversation-skill", skillId: "character-design" } });
  assert.equal(workbench.ui.canvasAgent.promptDraft, "");
  assert.equal(workbench.ui.canvasAgent.selectedSkillId, "character-design");
  await controller.handleAction({ dataset: { agentAction: "select-free-conversation-skill", skillId: "series-images" } });
  assert.equal(workbench.ui.canvasAgent.promptDraft, "");
  assert.equal(workbench.ui.canvasAgent.selectedSkillId, "series-images");
  workbench.ui.canvasAgent.promptDraft = "";
  await controller.handleAction({ dataset: { agentAction: "continue-creative-document", documentTitle: "第一集大纲", documentId: "outline" } });
  assert.equal(workbench.ui.canvasAgent.promptDraft, "继续编辑《第一集大纲》：");

  await controller.handleAction({ dataset: { agentAction: "answer-creative-question", questionTaskId: "creative-task", questionId: "style", answer: "水彩" } });
  assert.deepEqual(controls, [{
    taskId: "creative-task",
    action: "interject",
    input: { message: { text: "水彩", preferredModels: { image: "image-pro" }, preferredGenerationParameters: { image: {} } } },
  }, {
    taskId: "creative-task",
    action: "resume",
    input: {},
  }]);
  controller.dispose();
});

test("continuing a document keeps its ID hidden from the draft and sends it with the message", async () => {
  const sent = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        modelCode: "text-pro", modelsStatus: "ready",
        models: [{ modelCode: "text-pro", modelLabel: "文本创作" }],
        generationModelsStatus: "ready", generationModels: [],
      },
    },
    api: {
      async createFreeGenerationConversation() { return { conversation: { id: "creative-conversation" } }; },
      async sendFreeGenerationMessage(_conversationId, input) { sent.push(input); return { task: { id: "creative-task", status: "queued" } }; },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  await controller.handleAction({ dataset: { agentAction: "continue-creative-document", documentTitle: "第一集大纲", documentId: "outline-v2" } });
  assert.equal(workbench.ui.canvasAgent.promptDraft, "继续编辑《第一集大纲》：");
  assert.equal(workbench.ui.canvasAgent.promptCreativeDocumentId, "outline-v2");
  workbench.ui.canvasAgent.promptDraft += "把车站场景改为雨夜。";
  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.equal(sent[0].message.text, "继续编辑《第一集大纲》：把车站场景改为雨夜。");
  assert.equal(sent[0].message.creativeDocumentId, "outline-v2");
  assert.doesNotMatch(sent[0].message.text, /outline-v2/);
  assert.equal(workbench.ui.canvasAgent.promptCreativeDocumentId, "");
  controller.dispose();
});

test("Agent mode interjects the waiting task instead of creating another task", async () => {
  const sent = [];
  const controls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        conversationId: "creative-conversation", taskId: "waiting-task", status: "waiting_external", promptDraft: "把镜头改成黄昏", generationKind: "agent",
        generationModelsStatus: "ready", generationModels: [{ modelCode: "image-pro", mediaType: "image", enabled: true }],
      },
    },
    api: {
      async sendFreeGenerationMessage(_conversationId, input) { sent.push(input); return { task: { id: "unexpected-task" } }; },
      async controlFreeGenerationTask(taskId, action, input) {
        controls.push({ taskId, action, input });
        return { result: { status: "running" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  await controller.submitPrompt({ text: "把镜头改成黄昏" });

  assert.deepEqual(sent, []);
  assert.deepEqual(controls, [{
    taskId: "waiting-task",
    action: "interject",
    input: { message: { text: "把镜头改成黄昏", preferredModels: { image: "image-pro" }, preferredGenerationParameters: { image: {} } } },
  }]);
  controller.dispose();
});

test("only the current paused task exposes an actionable creative question", async () => {
  const calls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        taskId: "current-task", status: "paused",
        messages: [{ taskId: "old-task", role: "tool", creative: { type: "question", id: "style", question: "旧问题", options: ["水彩"] } }],
      },
    },
    api: {
      async controlFreeGenerationTask(...input) { calls.push(input); return { result: { status: "running" } }; },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  const html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /data-question-task-id="old-task"[^>]*disabled/);
  await controller.handleAction({ dataset: { agentAction: "answer-creative-question", questionTaskId: "old-task", questionId: "style", answer: "水彩" } });
  assert.deepEqual(calls, []);
  controller.dispose();
});

test("only the newest unanswered question in a paused task is actionable", async () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      taskId: "creative-task", status: "paused",
      messages: [
        { id: "question-one", taskId: "creative-task", role: "tool", creative: { type: "question", id: "q1", question: "第一个问题", options: ["A"] } },
        { id: "answer-one", taskId: "creative-task", role: "user", text: "A" },
        { id: "question-two", taskId: "creative-task", role: "tool", creative: { type: "question", id: "q2", question: "第二个问题", options: ["B"] } },
      ],
    },
  });

  assert.match(html, /data-question-id="q1"[^>]*disabled/);
  assert.match(html, /data-question-id="q2"[^>]*(?<!disabled)>B<\/button>/);
});

test("creative update events refresh persisted cards and paused questions through the live task stream", async () => {
  let messageCalls = 0;
  let streamCalls = 0;
  const controls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        modelCode: "text-pro", modelsStatus: "ready",
        models: [{ modelCode: "text-pro", modelLabel: "文本创作" }],
        generationModelsStatus: "ready", generationModels: [],
      },
    },
    api: {
      async listFreeGenerationConversations() {
        return { conversations: [{ id: "creative-conversation", taskId: "creative-task", taskStatus: "running" }] };
      },
      async listFreeGenerationMessages() {
        messageCalls += 1;
        return {
          messages: messageCalls === 1 ? [] : [{
            id: "question-card", taskId: "creative-task", role: "tool",
            content: {
              toolId: "creative.ask",
              output: { creative: { type: "question", id: "palette", question: "请选择主色调", options: ["暖色"] } },
            },
          }],
        };
      },
      async *streamFreeGenerationEvents() {
        streamCalls += 1;
        if (streamCalls > 1) return;
        yield { data: { id: "creative-update", sequence: 1, eventType: "creative.updated", event: { stepId: "ask-step", toolId: "creative.ask" } } };
        yield { data: { id: "creative-paused", sequence: 2, eventType: "task.paused", event: { reason: "creative_question", stepId: "ask-step" } } };
      },
      async controlFreeGenerationTask(taskId, action, input) {
        controls.push({ taskId, action, input });
        return { result: { status: action === "resume" ? "queued" : "paused" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only", pollIntervalMs: 60_000,
  });

  await controller.resume();
  for (let index = 0; index < 30 && workbench.ui.canvasAgent.status !== "paused"; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assert.equal(workbench.ui.canvasAgent.status, "paused");
  assert.ok(messageCalls >= 2);
  const html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /请选择主色调/);
  assert.match(html, /data-question-id="palette"[^>]*(?<!disabled)>暖色<\/button>/);
  await controller.handleAction({ dataset: { agentAction: "answer-creative-question", questionTaskId: "creative-task", questionId: "palette", answer: "暖色" } });
  assert.deepEqual(controls.map((control) => control.action), ["interject", "resume"]);
  controller.dispose();
});

test("Agent mode keeps its running task stoppable after an earlier media result succeeds", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      taskId: "creative-task", status: "running", generationKind: "agent",
      generationModelsStatus: "ready", generationModels: [{ modelCode: "image-pro", mediaType: "image", enabled: true }],
      messages: [{
        id: "completed-image", taskId: "creative-task", role: "tool", generationTaskId: "image-task",
        media: { kind: "image", status: "succeeded", url: "/generated.png" },
      }],
    },
  });

  assert.match(html, /canvas-agent-send-button is-running[^>]*data-agent-action="stop"/);
  assert.doesNotMatch(html, /canvas-agent-send-button[^>]*data-agent-action="send"/);
});

test("choosing an image model keeps Agent mode active until the user explicitly changes modes", async () => {
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        generationKind: "agent", generationModelsStatus: "ready",
        generationModels: [
          { modelCode: "image-fast", modelLabel: "图片快", mediaType: "image", enabled: true },
          { modelCode: "image-pro", modelLabel: "图片 Pro", mediaType: "image", enabled: true },
        ],
      },
    },
    api: {},
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  await controller.handleAction({ dataset: { agentAction: "toggle-free-generation-menu", field: "model:image" } });
  await controller.handleAction({ dataset: { agentAction: "select-free-generation-model", modelKind: "image", modelId: "image-pro" } });

  assert.equal(workbench.ui.canvasAgent.generationKind, "agent");
  assert.equal(workbench.ui.canvasAgent.generationModelCodes.image, "image-pro");
  controller.dispose();
});

test("a selected skill without a user request cannot start a generation task", async () => {
  const sent = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        promptDraft: "/character-design ", generationKind: "agent", generationModelsStatus: "ready",
        generationModels: [{ modelCode: "image-pro", mediaType: "image", enabled: true }],
      },
    },
    api: {
      async createFreeGenerationConversation() { return { conversation: { id: "creative-conversation" } }; },
      async sendFreeGenerationMessage(_conversationId, input) { sent.push(input); return { task: { id: "unexpected-task" } }; },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  await controller.handleAction({ dataset: { agentAction: "interject-prompt" } });

  assert.deepEqual(sent, []);
  assert.equal(workbench.ui.canvasAgent.error, "请在已选技能后补充具体创作需求。");
  controller.dispose();
});

test("free conversation Enter sends a typed answer through interject when the latest creative card is a question", async () => {
  const controls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        taskId: "creative-task", status: "paused", promptDraft: "偏暖色调", generationKind: "agent",
        messages: [{ taskId: "creative-task", role: "tool", creative: { type: "question", id: "tone", question: "请补充色调" } }],
        generationModelsStatus: "ready", generationModels: [{ modelCode: "image-pro", mediaType: "image", enabled: true }],
      },
    },
    api: {
      async controlFreeGenerationTask(taskId, action, input) {
        controls.push({ taskId, action, input });
        return { result: { status: "running" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, capabilityProfile: "media_generation_only" });

  let prevented = false;
  assert.equal(controller.handleKeydown({
    key: "Enter",
    shiftKey: false,
    preventDefault() { prevented = true; },
  }, { dataset: { agentField: "promptDraft" } }), true);
  for (let index = 0; index < 20 && controls.length < 2; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assert.equal(prevented, true);
  assert.deepEqual(controls, [{
    taskId: "creative-task",
    action: "interject",
    input: { message: { text: "偏暖色调", preferredModels: { image: "image-pro" }, preferredGenerationParameters: { image: {} } } },
  }, {
    taskId: "creative-task",
    action: "resume",
    input: {},
  }]);
  controller.dispose();
});
