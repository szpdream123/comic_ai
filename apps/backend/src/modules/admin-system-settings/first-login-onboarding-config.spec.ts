import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultFirstLoginOnboardingConfig,
  firstLoginOnboardingConfigKey,
  normalizeFirstLoginOnboardingConfig,
  firstLoginOnboardingPlacements,
  firstLoginOnboardingTargets,
} from "./first-login-onboarding-config.ts";

test("first-login onboarding config exposes a fixed default copy contract", () => {
  const config = normalizeFirstLoginOnboardingConfig(undefined);

  assert.equal(firstLoginOnboardingConfigKey, "creator.first_login_onboarding");
  assert.deepEqual(config, defaultFirstLoginOnboardingConfig);
  assert.equal(config.welcome.title, "2分钟完成你的第一组分镜");
  assert.equal(config.steps.createProject.title, "创建一个项目");
  assert.equal(config.complete.primaryButton, "完成");
  assert.deepEqual(config.tips, []);
  assert.deepEqual(firstLoginOnboardingPlacements.map((item) => item.key), [
    "before-create-project",
    "before-enter-project",
    "before-prepare-script",
    "before-generate-storyboard",
    "before-confirm-storyboard",
    "before-complete",
  ]);
});

test("first-login onboarding exposes useful safe targets at every timeline boundary", () => {
  const targetsAt = (placement: string) => firstLoginOnboardingTargets
    .filter((target) => target.placements.includes(placement as never))
    .map((target) => target.key);

  assert.deepEqual(targetsAt("before-create-project"), ["project-module-entry", "create-project-button"]);
  assert.deepEqual(targetsAt("before-prepare-script"), ["episode-module-entry", "create-first-episode-button"]);
  assert.deepEqual(targetsAt("before-generate-storyboard"), [
    "script-input",
    "text-model-selector",
    "prompt-skill-selector",
    "generate-storyboard-button",
  ]);
  assert.deepEqual(targetsAt("before-confirm-storyboard"), [
    "storyboard-preview-surface",
    "scene-preview-table",
    "character-preview-table",
    "prop-preview-table",
    "storyboard-preview-table",
    "commit-storyboard-button",
  ]);
  assert.deepEqual(targetsAt("before-complete"), ["storyboard-workbench", "first-storyboard-card"]);
  assert.equal(firstLoginOnboardingTargets.every((target) => Boolean(target.pageLabel)), true);
  assert.equal(firstLoginOnboardingTargets.find((target) => target.key === "project-module-entry")?.action, "set-nav-tab");
  assert.equal(firstLoginOnboardingTargets.find((target) => target.key === "episode-module-entry")?.action, "set-project-interior-section");
  assert.equal(firstLoginOnboardingTargets.find((target) => target.key === "prompt-skill-selector")?.action, "open-episode-prompt-skill-modal");
});

test("first-login onboarding keeps new timeline tips only with a compatible safe target", () => {
  const baseTip = {
    eyebrow: "结果说明",
    title: "先检查分镜结果",
    description: "这里可以检查生成完成的分镜。",
    primaryButton: "下一步",
  };
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [
      {
        ...baseTip,
        id: "review-storyboard",
        placement: "before-confirm-storyboard",
        targetKey: "storyboard-preview-table",
      },
      {
        ...baseTip,
        id: "mismatched-target",
        placement: "before-complete",
        targetKey: "storyboard-preview-table",
      },
    ],
  });

  assert.deepEqual(config.tips.map((tip) => tip.id), ["review-storyboard"]);
});

test("first-login onboarding config accepts safe text overrides without changing the fixed schema", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    welcome: { title: "三分钟掌握基础创作", unknown: "ignored" },
    steps: {
      createProject: { description: "先从一个清晰的项目名称开始。" },
      unknownStep: { title: "ignored" },
    },
    prepareScriptButtons: { sample: "试试官方示例" },
    unknownRoot: true,
  });

  assert.equal(config.welcome.title, "三分钟掌握基础创作");
  assert.equal(config.welcome.description, defaultFirstLoginOnboardingConfig.welcome.description);
  assert.equal(config.steps.createProject.description, "先从一个清晰的项目名称开始。");
  assert.equal(config.prepareScriptButtons.sample, "试试官方示例");
  assert.deepEqual(Object.keys(config), ["welcome", "steps", "prepareScriptButtons", "complete", "tips"]);
  assert.deepEqual(Object.keys(config.steps), [
    "createProject",
    "enterProject",
    "prepareScript",
    "generateStoryboard",
    "generating",
    "confirmStoryboard",
  ]);
});

test("first-login onboarding config keeps ordered tips only for registered placements and targets", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [
      {
        id: "find-create-tool",
        placement: "before-create-project",
        targetKey: "create-project-button",
        eyebrow: "先看这里",
        title: "创建入口在页面下方",
        description: "高亮区域就是创建项目工具。",
        primaryButton: "知道了",
      },
      {
        id: "find-create-tool",
        placement: "before-enter-project",
        targetKey: "recent-project-card",
        title: "duplicate ignored",
      },
      {
        id: "unsafe-target",
        placement: "before-create-project",
        targetKey: "body > script",
        title: "unsafe ignored",
      },
    ],
  });

  assert.deepEqual(config.tips, [
    {
      id: "find-create-tool",
      placement: "before-create-project",
      targetKey: "create-project-button",
      eyebrow: "先看这里",
      title: "创建入口在页面下方",
      description: "高亮区域就是创建项目工具。",
      primaryButton: "知道了",
    },
  ]);
});

test("first-login onboarding config falls back field-by-field for blank, oversized, or non-string values", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    welcome: {
      eyebrow: "   ",
      title: "x".repeat(61),
      description: 42,
      primaryButton: "  立即开始  ",
    },
    steps: {
      createProject: {
        eyebrow: "新手第一步",
        description: "x".repeat(161),
      },
    },
    complete: { primaryButton: "x".repeat(31) },
  });

  assert.equal(config.welcome.eyebrow, defaultFirstLoginOnboardingConfig.welcome.eyebrow);
  assert.equal(config.welcome.title, defaultFirstLoginOnboardingConfig.welcome.title);
  assert.equal(config.welcome.description, defaultFirstLoginOnboardingConfig.welcome.description);
  assert.equal(config.welcome.primaryButton, "立即开始");
  assert.equal(config.steps.createProject.eyebrow, "新手第一步");
  assert.equal(config.steps.createProject.description, defaultFirstLoginOnboardingConfig.steps.createProject.description);
  assert.equal(config.complete.primaryButton, defaultFirstLoginOnboardingConfig.complete.primaryButton);
});
