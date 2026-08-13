export const firstLoginOnboardingConfigKey = "creator.first_login_onboarding";

export interface FirstLoginOnboardingCardCopy {
  eyebrow: string;
  title: string;
  description: string;
}

export interface FirstLoginOnboardingConfig {
  welcome: FirstLoginOnboardingCardCopy & {
    primaryButton: string;
    secondaryButton: string;
  };
  steps: {
    createProject: FirstLoginOnboardingCardCopy;
    enterProject: FirstLoginOnboardingCardCopy;
    prepareScript: FirstLoginOnboardingCardCopy;
    generateStoryboard: FirstLoginOnboardingCardCopy;
    generating: FirstLoginOnboardingCardCopy;
    confirmStoryboard: FirstLoginOnboardingCardCopy;
  };
  prepareScriptButtons: {
    sample: string;
    own: string;
  };
  complete: FirstLoginOnboardingCardCopy & {
    primaryButton: string;
  };
  tips: FirstLoginOnboardingTip[];
}

export const firstLoginOnboardingPlacements = [
  { key: "before-create-project", label: "创建项目前" },
  { key: "before-enter-project", label: "进入项目前" },
  { key: "before-prepare-script", label: "准备剧本前" },
  { key: "before-generate-storyboard", label: "生成分镜前" },
  { key: "before-confirm-storyboard", label: "生成完成、确认预览前" },
  { key: "before-complete", label: "确认提交、完成卡片前" },
] as const;

export type FirstLoginOnboardingPlacement = (typeof firstLoginOnboardingPlacements)[number]["key"];

export const firstLoginOnboardingTargets = [
  {
    key: "project-module-entry",
    label: "项目模块入口",
    pageLabel: "项目列表",
    placements: ["before-create-project"],
  },
  {
    key: "create-project-button",
    label: "创建项目按钮",
    pageLabel: "项目列表",
    action: "open-create-modal",
    placements: ["before-create-project"],
  },
  {
    key: "recent-project-card",
    label: "刚创建的项目卡片",
    pageLabel: "项目列表",
    action: "open-project-detail",
    placements: ["before-enter-project"],
  },
  {
    key: "episode-module-entry",
    label: "剧集模块入口",
    pageLabel: "项目详情",
    placements: ["before-prepare-script"],
  },
  {
    key: "create-first-episode-button",
    label: "创建第一集按钮",
    pageLabel: "项目详情",
    action: "open-single-episode-flow",
    placements: ["before-prepare-script"],
  },
  {
    key: "script-input",
    label: "剧本输入区",
    pageLabel: "创建第一集",
    placements: ["before-generate-storyboard"],
  },
  {
    key: "text-model-selector",
    label: "文本模型选择",
    pageLabel: "创建第一集",
    action: "toggle-single-episode-text-model-menu",
    placements: ["before-generate-storyboard"],
  },
  {
    key: "prompt-skill-selector",
    label: "提示词技能选择",
    pageLabel: "创建第一集",
    placements: ["before-generate-storyboard"],
  },
  {
    key: "generate-storyboard-button",
    label: "AI 生成分镜按钮",
    pageLabel: "创建第一集",
    action: "confirm-single-episode",
    placements: ["before-generate-storyboard"],
  },
  {
    key: "storyboard-preview-surface",
    label: "分镜预览区域",
    pageLabel: "分镜预览",
    placements: ["before-confirm-storyboard"],
  },
  {
    key: "scene-preview-table",
    label: "场景表",
    pageLabel: "分镜预览",
    placements: ["before-confirm-storyboard"],
  },
  {
    key: "character-preview-table",
    label: "角色表",
    pageLabel: "分镜预览",
    placements: ["before-confirm-storyboard"],
  },
  {
    key: "prop-preview-table",
    label: "道具表",
    pageLabel: "分镜预览",
    placements: ["before-confirm-storyboard"],
  },
  {
    key: "storyboard-preview-table",
    label: "分镜表",
    pageLabel: "分镜预览",
    placements: ["before-confirm-storyboard"],
  },
  {
    key: "commit-storyboard-button",
    label: "创建章节按钮",
    pageLabel: "分镜预览",
    action: "commit-ai-storyboard-preview",
    placements: ["before-confirm-storyboard"],
  },
  {
    key: "storyboard-workbench",
    label: "分镜工作台",
    pageLabel: "分镜工作台",
    placements: ["before-complete"],
  },
  {
    key: "first-storyboard-card",
    label: "第一条分镜",
    pageLabel: "分镜工作台",
    placements: ["before-complete"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  pageLabel: string;
  action?: string;
  placements: readonly FirstLoginOnboardingPlacement[];
}>;

export type FirstLoginOnboardingTargetKey = (typeof firstLoginOnboardingTargets)[number]["key"];

export interface FirstLoginOnboardingTip extends FirstLoginOnboardingCardCopy {
  id: string;
  placement: FirstLoginOnboardingPlacement;
  targetKey: FirstLoginOnboardingTargetKey;
  primaryButton: string;
}

export const defaultFirstLoginOnboardingConfig: FirstLoginOnboardingConfig = {
  welcome: {
    eyebrow: "快速入门",
    title: "2分钟完成你的第一组分镜",
    description: "跟着 4 个基础操作走一遍，其他功能以后再慢慢探索。",
    primaryButton: "开始体验",
    secondaryButton: "暂时跳过",
  },
  steps: {
    createProject: {
      eyebrow: "第一步",
      title: "创建一个项目",
      description: "点击“创建项目”，填写项目名称和作品类型。",
    },
    enterProject: {
      eyebrow: "第二步",
      title: "进入刚创建的项目",
      description: "在项目列表中点击刚创建的项目，进入创作空间。",
    },
    prepareScript: {
      eyebrow: "第三步",
      title: "准备第一集剧本",
      description: "你可以先用示例体验，也可以直接输入自己的剧本。",
    },
    generateStoryboard: {
      eyebrow: "第四步",
      title: "生成第一组分镜",
      description: "确认剧本内容后，点击 AI 生成分镜。",
    },
    generating: {
      eyebrow: "正在处理",
      title: "AI 正在拆解剧本",
      description: "可以留在当前页面，生成完成后会显示分镜预览。",
    },
    confirmStoryboard: {
      eyebrow: "最后一步",
      title: "确认分镜预览",
      description: "检查预览内容，然后确认创建第一集。",
    },
  },
  prepareScriptButtons: {
    sample: "使用示例剧本",
    own: "输入自己的剧本",
  },
  complete: {
    eyebrow: "入门完成",
    title: "第一组分镜已完成",
    description: "你已经掌握基础创作流程，接下来可以自由探索工作台。",
    primaryButton: "完成",
  },
  tips: [],
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : fallback;
}

function normalizeCardCopy(value: unknown, fallback: FirstLoginOnboardingCardCopy) {
  const record = recordValue(value);
  return {
    eyebrow: normalizedText(record.eyebrow, fallback.eyebrow, 30),
    title: normalizedText(record.title, fallback.title, 60),
    description: normalizedText(record.description, fallback.description, 160),
  };
}

const validPlacements = new Set(firstLoginOnboardingPlacements.map((item) => item.key));
const targetByKey = new Map(firstLoginOnboardingTargets.map((item) => [item.key, item]));

function normalizeTips(value: unknown): FirstLoginOnboardingTip[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const tips: FirstLoginOnboardingTip[] = [];

  for (const item of value.slice(0, 12)) {
    const record = recordValue(item);
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const placement = typeof record.placement === "string" ? record.placement.trim() : "";
    const targetKey = typeof record.targetKey === "string" ? record.targetKey.trim() : "";
    const target = targetByKey.get(targetKey as FirstLoginOnboardingTargetKey);
    const eyebrow = normalizedText(record.eyebrow, "", 30);
    const title = normalizedText(record.title, "", 60);
    const description = normalizedText(record.description, "", 160);
    const primaryButton = normalizedText(record.primaryButton, "", 30);

    if (
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ||
      seenIds.has(id) ||
      !validPlacements.has(placement as FirstLoginOnboardingPlacement) ||
      !target ||
      !target.placements.includes(placement as never) ||
      !eyebrow ||
      !title ||
      !description ||
      !primaryButton
    ) {
      continue;
    }

    seenIds.add(id);
    tips.push({
      id,
      placement: placement as FirstLoginOnboardingPlacement,
      targetKey: targetKey as FirstLoginOnboardingTargetKey,
      eyebrow,
      title,
      description,
      primaryButton,
    });
  }

  return tips;
}

export function normalizeFirstLoginOnboardingConfig(value: unknown): FirstLoginOnboardingConfig {
  const root = recordValue(value);
  const welcome = recordValue(root.welcome);
  const steps = recordValue(root.steps);
  const buttons = recordValue(root.prepareScriptButtons);
  const complete = recordValue(root.complete);

  return {
    welcome: {
      ...normalizeCardCopy(welcome, defaultFirstLoginOnboardingConfig.welcome),
      primaryButton: normalizedText(
        welcome.primaryButton,
        defaultFirstLoginOnboardingConfig.welcome.primaryButton,
        30,
      ),
      secondaryButton: normalizedText(
        welcome.secondaryButton,
        defaultFirstLoginOnboardingConfig.welcome.secondaryButton,
        30,
      ),
    },
    steps: {
      createProject: normalizeCardCopy(steps.createProject, defaultFirstLoginOnboardingConfig.steps.createProject),
      enterProject: normalizeCardCopy(steps.enterProject, defaultFirstLoginOnboardingConfig.steps.enterProject),
      prepareScript: normalizeCardCopy(steps.prepareScript, defaultFirstLoginOnboardingConfig.steps.prepareScript),
      generateStoryboard: normalizeCardCopy(steps.generateStoryboard, defaultFirstLoginOnboardingConfig.steps.generateStoryboard),
      generating: normalizeCardCopy(steps.generating, defaultFirstLoginOnboardingConfig.steps.generating),
      confirmStoryboard: normalizeCardCopy(steps.confirmStoryboard, defaultFirstLoginOnboardingConfig.steps.confirmStoryboard),
    },
    prepareScriptButtons: {
      sample: normalizedText(buttons.sample, defaultFirstLoginOnboardingConfig.prepareScriptButtons.sample, 30),
      own: normalizedText(buttons.own, defaultFirstLoginOnboardingConfig.prepareScriptButtons.own, 30),
    },
    complete: {
      ...normalizeCardCopy(complete, defaultFirstLoginOnboardingConfig.complete),
      primaryButton: normalizedText(
        complete.primaryButton,
        defaultFirstLoginOnboardingConfig.complete.primaryButton,
        30,
      ),
    },
    tips: normalizeTips(root.tips),
  };
}
