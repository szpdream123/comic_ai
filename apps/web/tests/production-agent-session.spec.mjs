import assert from "node:assert/strict";
import test from "node:test";

import {
  captureProductionAgentTimelineScroll,
  mergeProductionAgentSessionPoll,
  renderProductionAgentSession,
  restoreProductionAgentTimelineScroll,
} from "../src/features/production-workbench/production-agent-session.js";

test("production agent workspace lists skill names without file paths", () => {
  const html = renderProductionAgentSession({
    productionAgentSession: {
      open: true,
      status: "running",
      conversation: {
        skillCatalog: [{
          id: "skill-1",
          name: "通用小说转剧本",
          description: "把小说转成剧本",
          files: [
            { path: "SKILL.md", kind: "instruction" },
            { path: "references/script.md", kind: "instruction" },
          ],
        }],
        source: { scriptFileName: "斗破.txt", previewText: "正文" },
        workspace: { artifacts: {} },
      },
      messages: [],
      events: [],
    },
  });

  assert.match(html, />通用小说转剧本</);
  assert.match(html, />Skill</);
  assert.match(html, /<span class="production-agent-session-file is-static">通用小说转剧本<\/span>/);
  assert.doesNotMatch(html, /<button[^>]*>通用小说转剧本</);
  assert.doesNotMatch(html, /data-action="select-production-agent-artifact" data-path="skill\//);
  assert.doesNotMatch(html, /data-path="SKILL\.md"/);
  assert.doesNotMatch(html, /data-path="references\/script\.md"/);
});

test("production agent timeline shows loaded SKILL.md first", () => {
  const html = renderProductionAgentSession({
    productionAgentSession: {
      open: true,
      status: "running",
      conversation: {
        skillCatalog: [{ id: "skill-1", name: "通用小说转剧本", description: "把小说转成剧本" }],
        source: { scriptFileName: "斗破.txt", previewText: "正文" },
        workspace: { artifacts: {} },
      },
      messages: [
        { role: "user", content: { text: "请根据所选 Skill 和源文本开始分析。" } },
        { role: "tool", content: { toolId: "load_skill", output: { path: "SKILL.md", name: "通用小说转剧本" } } },
        { role: "tool", content: { toolId: "read_skill_file", output: { path: "references/script.md" } } },
      ],
      events: [],
    },
  });
  const loadIndex = html.indexOf("已加载 SKILL.md");
  const extraIndex = html.indexOf("已读取 references/script.md");
  assert.match(html, /已加载 SKILL\.md/);
  assert.equal(loadIndex >= 0 && extraIndex > loadIndex, true);
});

test("production agent workspace follows the latest artifact until the user selects one", () => {
  const html = renderProductionAgentSession({
    productionAgentSession: {
      open: true,
      status: "running",
      conversation: {
        skillCatalog: [],
        source: { scriptFileName: "斗破.txt", previewText: "正文" },
        workspace: { artifacts: { "01_剧本.md": "# 剧本", "02_角色.md": "# 角色" } },
      },
      messages: [],
      events: [],
    },
  });
  assert.match(html, /class="production-agent-session-file is-active"[^>]*data-path="02_角色\.md"|data-path="02_角色\.md"[^>]*class="production-agent-session-file is-active"/);
  assert.match(html, /<pre class="production-agent-session-artifact"># 角色<\/pre>/);
  assert.match(html, /production-agent-session-preview/);
});

test("production agent paused session shows continue and next-step buttons", () => {
  const html = renderProductionAgentSession({
    productionAgentSession: {
      open: true,
      status: "succeeded",
      task: { status: "succeeded" },
      conversation: {
        skillCatalog: [],
        source: { scriptFileName: "斗破.txt" },
        workspace: { artifacts: { "01_剧本.md": "# 剧本" } },
      },
      messages: [{
        role: "assistant",
        content: { message: "create_project 返回错误。请告知是否需要我继续补齐场景、道具、分镜资产再一并创建。" },
      }],
      events: [],
    },
  });
  assert.match(html, /data-action="continue-production-agent-session"/);
  assert.match(html, />继续全部</);
  assert.match(html, />场景</);
  assert.match(html, />道具</);
  assert.match(html, />分镜</);
  assert.match(html, />创建项目</);
});

test("production agent round budget failure is shown in Chinese", () => {
  const session = mergeProductionAgentSessionPoll({
    open: true,
    conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
    messages: [],
    events: [],
  }, {
    task: { status: "failed", failureCode: "production_agent_round_budget_exceeded", failureMessage: "production_agent_round_budget_exceeded" },
  });
  const html = renderProductionAgentSession({ productionAgentSession: session });
  assert.match(html, /分析步骤过多，已停止/);
  assert.doesNotMatch(html, /production_agent_round_budget_exceeded/);
});

test("production agent truncated output failure is shown in Chinese", () => {
  const session = mergeProductionAgentSessionPoll({
    open: true,
    conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
    messages: [],
    events: [],
  }, {
    task: { status: "failed", failureCode: "provider_output_truncated", failureMessage: "provider_output_truncated" },
  });
  const html = renderProductionAgentSession({ productionAgentSession: session });
  assert.match(html, /模型输出被截断/);
  assert.doesNotMatch(html, /provider_output_truncated/);
});

test("production agent unknown failure code is shown instead of generic fallback", () => {
  const session = mergeProductionAgentSessionPoll({
    open: true,
    conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
    messages: [],
    events: [],
  }, {
    task: { status: "failed", failureCode: "provider_stream_timeout", failureMessage: "provider_stream_timeout" },
  });
  const html = renderProductionAgentSession({ productionAgentSession: session });
  assert.match(html, /provider_stream_timeout/);
  assert.doesNotMatch(html, /<small>项目制作失败<\/small>/);
});

test("production agent incomplete format_project shows uncovered assets", () => {
  const html = renderProductionAgentSession({
    productionAgentSession: {
      open: true,
      status: "running",
      conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
      messages: [{
        role: "tool",
        content: {
          toolId: "format_project",
          output: {
            incomplete: true,
            uncovered: {
              characters: ["任小草"],
              scenes: ["木屋巷道"],
              props: ["切割刀"],
              storyboards: ["1-3 城门口"],
            },
          },
        },
      }],
      events: [],
    },
  });
  assert.match(html, /尚未覆盖全部剧本，已暂停收口：角色缺 任小草；场景缺 木屋巷道；道具缺 切割刀；分镜缺 1-3 城门口/);
});

test("production agent incomplete characters failure is shown in Chinese", () => {
  const session = mergeProductionAgentSessionPoll({
    open: true,
    conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
    messages: [],
    events: [],
  }, {
    task: { status: "failed", failureCode: "production_agent_characters_incomplete:任小草", failureMessage: "production_agent_characters_incomplete:任小草" },
  });
  const html = renderProductionAgentSession({ productionAgentSession: session });
  assert.match(html, /角色尚未覆盖全部剧本/);
  assert.doesNotMatch(html, /production_agent_characters_incomplete/);
});

test("production agent incomplete storyboards failure is shown in Chinese", () => {
  const session = mergeProductionAgentSessionPoll({
    open: true,
    conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
    messages: [],
    events: [],
  }, {
    task: { status: "failed", failureCode: "production_agent_storyboards_incomplete:1-3 城门口", failureMessage: "production_agent_storyboards_incomplete:1-3 城门口" },
  });
  const html = renderProductionAgentSession({ productionAgentSession: session });
  assert.match(html, /分镜尚未覆盖全部剧本/);
  assert.doesNotMatch(html, /production_agent_storyboards_incomplete/);
});

test("production agent tool execution failure is shown in Chinese", () => {
  const session = mergeProductionAgentSessionPoll({
    open: true,
    conversation: { skillCatalog: [], source: {}, workspace: { artifacts: {} } },
    messages: [],
    events: [],
  }, {
    task: { status: "failed", failureCode: "production_agent_tool_execution_failed", failureMessage: "production_agent_tool_execution_failed" },
  });
  const html = renderProductionAgentSession({ productionAgentSession: session });
  assert.match(html, /工具执行失败，请重试/);
  assert.doesNotMatch(html, /<small>项目制作失败<\/small>/);
});

test("production agent timeline pins to latest after content grows", () => {
  const frames = [];
  const timeouts = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousTimeout = globalThis.setTimeout;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.setTimeout = (callback) => {
    timeouts.push(callback);
    return timeouts.length;
  };
  try {
    const element = {
      isConnected: true,
      scrollTop: 0,
      scrollHeight: 80,
      clientHeight: 80,
    };
    const captured = captureProductionAgentTimelineScroll(element);
    assert.equal(captured.stickToBottom, true);
    element.scrollHeight = 640;
    restoreProductionAgentTimelineScroll(element, captured);
    assert.equal(element.scrollTop, 560);
    element.scrollHeight = 900;
    for (const callback of [...frames, ...timeouts]) callback();
    assert.equal(element.scrollTop, 820);
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.setTimeout = previousTimeout;
  }
});

test("production agent timeline keeps a user-scrolled offset while output grows", () => {
  const frames = [];
  const timeouts = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousTimeout = globalThis.setTimeout;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.setTimeout = (callback) => {
    timeouts.push(callback);
    return timeouts.length;
  };
  try {
    const element = {
      isConnected: true,
      scrollTop: 120,
      scrollHeight: 800,
      clientHeight: 200,
    };
    const captured = captureProductionAgentTimelineScroll(element);
    assert.equal(captured.stickToBottom, false);
    element.scrollHeight = 1200;
    restoreProductionAgentTimelineScroll(element, captured);
    assert.equal(element.scrollTop, 120);
    element.scrollHeight = 1800;
    for (const callback of [...frames, ...timeouts]) callback();
    assert.equal(element.scrollTop, 120);
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.setTimeout = previousTimeout;
  }
});
