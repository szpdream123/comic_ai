import assert from "node:assert/strict";
import test from "node:test";

import {
  updateToolboxPromptReversePluginProgressForTest,
  updateToolboxPromptReverseProgressForTest,
} from "../src/features/production-workbench/index.js";

function createProgressWorkbench(state) {
  const title = { textContent: "" };
  const copy = { textContent: "" };
  const button = { textContent: "" };
  const loading = {
    querySelector(selector) {
      return {
        "[data-toolbox-prompt-reverse-loading-title]": title,
        "[data-toolbox-prompt-reverse-loading-copy]": copy,
      }[selector] ?? null;
    },
  };
  const modal = {
    querySelector(selector) {
      return {
        "[data-toolbox-prompt-reverse-loading]": loading,
        "[data-toolbox-prompt-reverse-progress-button]": button,
      }[selector] ?? null;
    },
  };
  return {
    workbench: {
      ui: { toolboxPromptReverse: state },
      root: { querySelector: (selector) => selector === ".toolbox-reverse-modal" ? modal : null },
    },
    title,
    copy,
    button,
  };
}

test("prompt reverse progress updates the existing modal without replacing it", () => {
  const fixture = createProgressWorkbench({ activeKind: "video", status: "decoding", progress: 42 });

  assert.equal(updateToolboxPromptReverseProgressForTest(fixture.workbench), true);
  assert.equal(fixture.title.textContent, "本机正在解析视频 42%");
  assert.equal(fixture.copy.textContent, "解码与逐帧提取只在当前电脑进行，源视频不会上传服务器。");
  assert.equal(fixture.button.textContent, "42%");

  fixture.workbench.ui.toolboxPromptReverse = { activeKind: "video", status: "preparing", progress: 78 };
  assert.equal(updateToolboxPromptReverseProgressForTest(fixture.workbench), true);
  assert.equal(fixture.title.textContent, "正在整理 6 FPS 时间轴 78%");
  assert.equal(fixture.copy.textContent, "正在将全部 6 FPS 时间轴画面按时间顺序整理为模型输入。");
  assert.equal(fixture.button.textContent, "78%");

  fixture.workbench.ui.toolboxPromptReverse = { activeKind: "video", status: "loading", progress: 96 };
  assert.equal(updateToolboxPromptReverseProgressForTest(fixture.workbench), true);
  assert.equal(fixture.title.textContent, "正在反推视频提示词");
  assert.equal(fixture.copy.textContent, "工具箱视频反推消耗积分，多模态模型正在分析完整时间轴的动作、场景与镜头信息。");
  assert.equal(fixture.button.textContent, "96%");

  fixture.workbench.ui.toolboxPromptReverse = { activeKind: "image", status: "loading", progress: 12 };
  assert.equal(updateToolboxPromptReverseProgressForTest(fixture.workbench), true);
  assert.equal(fixture.title.textContent, "正在分析参考图");
  assert.equal(fixture.copy.textContent, "工具箱图片反推消耗积分，模型正在提炼画面信息，请稍候。");
  assert.equal(fixture.button.textContent, "12%");
});

test("prompt reverse progress requests a full render when the modal nodes are missing", () => {
  const workbench = {
    ui: { toolboxPromptReverse: { activeKind: "video", status: "decoding", progress: 20 } },
    root: { querySelector: () => null },
  };

  assert.equal(updateToolboxPromptReverseProgressForTest(workbench), false);
});

test("prompt reverse plugin install progress updates the existing status node", () => {
  const message = { textContent: "" };
  const modal = {
    querySelector: (selector) => selector === "[data-toolbox-prompt-reverse-plugin-message]" ? message : null,
  };
  const workbench = {
    ui: {
      toolboxPromptReverse: {
        installMessage: "正在加载视频解码器",
        installProgress: 36,
      },
    },
    root: { querySelector: (selector) => selector === ".toolbox-reverse-modal" ? modal : null },
  };

  assert.equal(updateToolboxPromptReversePluginProgressForTest(workbench), true);
  assert.equal(message.textContent, "正在加载视频解码器 · 36%");

  workbench.ui.toolboxPromptReverse.installProgress = 82;
  assert.equal(updateToolboxPromptReversePluginProgressForTest(workbench), true);
  assert.equal(message.textContent, "正在加载视频解码器 · 82%");
});

test("prompt reverse plugin install progress requests a full render when the status node is missing", () => {
  const workbench = {
    ui: { toolboxPromptReverse: { installProgress: 20 } },
    root: { querySelector: () => null },
  };

  assert.equal(updateToolboxPromptReversePluginProgressForTest(workbench), false);
});
