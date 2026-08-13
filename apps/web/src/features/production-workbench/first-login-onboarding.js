export const FIRST_LOGIN_ONBOARDING_STORAGE_KEY = "comic-ai:first-login-onboarding:v1";
export const FIRST_LOGIN_ONBOARDING_SAMPLE_SCRIPT = `场景：傍晚，城市天台。
林夏握着一封未寄出的信，看向远处亮起的灯火。
手机突然响起，她迟疑片刻，按下接听。`;

export const DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG = {
  welcome: {
    eyebrow: "快速入门",
    title: "2分钟完成你的第一组分镜",
    description: "跟着 4 个基础操作走一遍，其他功能以后再慢慢探索。",
    primaryButton: "开始体验",
    secondaryButton: "暂时跳过",
  },
  steps: {
    createProject: { eyebrow: "第一步", title: "创建一个项目", description: "点击“创建项目”，填写项目名称和作品类型。" },
    enterProject: { eyebrow: "第二步", title: "进入刚创建的项目", description: "在项目列表中点击刚创建的项目，进入创作空间。" },
    prepareScript: { eyebrow: "第三步", title: "准备第一集剧本", description: "你可以先用示例体验，也可以直接输入自己的剧本。" },
    generateStoryboard: { eyebrow: "第四步", title: "生成第一组分镜", description: "确认剧本内容后，点击 AI 生成分镜。" },
    generating: { eyebrow: "正在处理", title: "AI 正在拆解剧本", description: "可以留在当前页面，生成完成后会显示分镜预览。" },
    confirmStoryboard: { eyebrow: "最后一步", title: "确认分镜预览", description: "检查预览内容，然后确认创建第一集。" },
  },
  prepareScriptButtons: { sample: "使用示例剧本", own: "输入自己的剧本" },
  complete: {
    eyebrow: "入门完成",
    title: "第一组分镜已完成",
    description: "你已经掌握基础创作流程，接下来可以自由探索工作台。",
    primaryButton: "完成",
  },
  tips: [],
};

const CORE_STEP_CONFIG_KEYS = {
  "create-project": "createProject",
  "enter-project": "enterProject",
  "prepare-script": "prepareScript",
  "generate-storyboard": "generateStoryboard",
  generating: "generating",
  "confirm-storyboard": "confirmStoryboard",
};
const CORE_STEP_PROGRESS = {
  "create-project": "1/4",
  "enter-project": "2/4",
  "prepare-script": "3/4",
  "generate-storyboard": "4/4",
  generating: "4/4",
  "confirm-storyboard": "4/4",
};
const PLACEMENT_BY_CORE_STEP = {
  "create-project": "before-create-project",
  "enter-project": "before-enter-project",
  "prepare-script": "before-prepare-script",
  "generate-storyboard": "before-generate-storyboard",
  "confirm-storyboard": "before-confirm-storyboard",
  complete: "before-complete",
};
const CORE_TARGET_BY_STEP = {
  "create-project": "create-project-button",
  "enter-project": "recent-project-card",
  "generate-storyboard": "generate-storyboard-button",
};
const TARGET_ACTION_BY_KEY = {
  "project-module-entry": "set-nav-tab",
  "create-project-button": "open-create-modal",
  "recent-project-card": "open-project-detail",
  "episode-module-entry": "set-project-interior-section",
  "create-first-episode-button": "open-single-episode-flow",
  "text-model-selector": "toggle-single-episode-text-model-menu",
  "prompt-skill-selector": "open-episode-prompt-skill-modal",
  "generate-storyboard-button": "confirm-single-episode",
  "commit-storyboard-button": "commit-ai-storyboard-preview",
};
const TARGET_PLACEMENTS_BY_KEY = {
  "project-module-entry": ["before-create-project"],
  "create-project-button": ["before-create-project"],
  "recent-project-card": ["before-enter-project"],
  "episode-module-entry": ["before-prepare-script"],
  "create-first-episode-button": ["before-prepare-script"],
  "script-input": ["before-generate-storyboard"],
  "text-model-selector": ["before-generate-storyboard"],
  "prompt-skill-selector": ["before-generate-storyboard"],
  "generate-storyboard-button": ["before-generate-storyboard"],
  "storyboard-preview-surface": ["before-confirm-storyboard"],
  "scene-preview-table": ["before-confirm-storyboard"],
  "character-preview-table": ["before-confirm-storyboard"],
  "prop-preview-table": ["before-confirm-storyboard"],
  "storyboard-preview-table": ["before-confirm-storyboard"],
  "commit-storyboard-button": ["before-confirm-storyboard"],
  "storyboard-workbench": ["before-complete"],
  "first-storyboard-card": ["before-complete"],
};
const ALLOWED_TIP_TARGETS = new Set(Object.keys(TARGET_PLACEMENTS_BY_KEY));
const ALLOWED_TIP_PLACEMENTS = new Set(Object.values(PLACEMENT_BY_CORE_STEP));

function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedText(value, fallback, maxLength) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= maxLength ? normalized : fallback;
}

function normalizeCard(value, fallback) {
  const record = recordValue(value);
  return {
    eyebrow: normalizedText(record.eyebrow, fallback.eyebrow, 30),
    title: normalizedText(record.title, fallback.title, 60),
    description: normalizedText(record.description, fallback.description, 160),
  };
}

export function normalizeFirstLoginOnboardingConfig(value) {
  const root = recordValue(value);
  const welcome = recordValue(root.welcome);
  const steps = recordValue(root.steps);
  const buttons = recordValue(root.prepareScriptButtons);
  const complete = recordValue(root.complete);
  const seenTipIds = new Set();
  const tips = (Array.isArray(root.tips) ? root.tips : []).slice(0, 12).flatMap((item) => {
    const tip = recordValue(item);
    const id = normalizedText(tip.id, "", 64);
    const placement = normalizedText(tip.placement, "", 40);
    const targetKey = normalizedText(tip.targetKey, "", 60);
    const normalized = {
      id,
      placement,
      targetKey,
      eyebrow: normalizedText(tip.eyebrow, "", 30),
      title: normalizedText(tip.title, "", 60),
      description: normalizedText(tip.description, "", 160),
      primaryButton: normalizedText(tip.primaryButton, "", 30),
    };
    if (
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || seenTipIds.has(id) ||
      !ALLOWED_TIP_PLACEMENTS.has(placement) || !ALLOWED_TIP_TARGETS.has(targetKey) ||
      !TARGET_PLACEMENTS_BY_KEY[targetKey]?.includes(placement) ||
      Object.values(normalized).some((field) => !field)
    ) return [];
    seenTipIds.add(id);
    return [normalized];
  });
  const config = {
    welcome: {
      ...normalizeCard(welcome, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.welcome),
      primaryButton: normalizedText(welcome.primaryButton, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.welcome.primaryButton, 30),
      secondaryButton: normalizedText(welcome.secondaryButton, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.welcome.secondaryButton, 30),
    },
    steps: {},
    prepareScriptButtons: {
      sample: normalizedText(buttons.sample, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.prepareScriptButtons.sample, 30),
      own: normalizedText(buttons.own, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.prepareScriptButtons.own, 30),
    },
    complete: {
      ...normalizeCard(complete, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.complete),
      primaryButton: normalizedText(complete.primaryButton, DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.complete.primaryButton, 30),
    },
    tips,
  };
  for (const key of Object.values(CORE_STEP_CONFIG_KEYS)) {
    config.steps[key] = normalizeCard(steps[key], DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.steps[key]);
  }
  return config;
}

function escapeGuideHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function markFirstLoginOnboarding(payload, storage) {
  const userId = String(payload?.user?.id ?? "").trim();
  if (payload?.isNewUser !== true || !userId || !storage) {
    return false;
  }

  try {
    storage.setItem(FIRST_LOGIN_ONBOARDING_STORAGE_KEY, JSON.stringify({
      userId,
      version: 1,
    }));
    return true;
  } catch {
    return false;
  }
}

export function consumeFirstLoginOnboarding(session, storage) {
  if (!storage) {
    return session;
  }

  let marker = null;
  try {
    const rawMarker = storage.getItem(FIRST_LOGIN_ONBOARDING_STORAGE_KEY);
    storage.removeItem(FIRST_LOGIN_ONBOARDING_STORAGE_KEY);
    marker = rawMarker ? JSON.parse(rawMarker) : null;
  } catch {
    try {
      storage.removeItem(FIRST_LOGIN_ONBOARDING_STORAGE_KEY);
    } catch {
      // Ignore blocked storage; onboarding is optional.
    }
    return session;
  }

  const sessionUserId = String(session?.user?.id ?? "").trim();
  const markerUserId = String(marker?.userId ?? "").trim();
  const isTeamMember = String(session?.user?.actorType ?? "").trim().toLowerCase() === "team_member";
  if (
    marker?.version !== 1 ||
    session?.authenticated !== true ||
    !sessionUserId ||
    markerUserId !== sessionUserId ||
    isTeamMember
  ) {
    return session;
  }

  return {
    ...session,
    firstLoginOnboarding: true,
  };
}

export function createFirstLoginGuideState(enabled, config) {
  return enabled === true ? {
    active: true,
    step: "welcome",
    config: normalizeFirstLoginOnboardingConfig(config),
    completedTipIds: [],
  } : null;
}

export function initializeFirstLoginGuide(session, config) {
  const isTeamMember = String(session?.user?.actorType ?? "").trim().toLowerCase() === "team_member";
  return createFirstLoginGuideState(
    session?.authenticated === true &&
    session?.firstLoginOnboarding === true &&
    !isTeamMember,
    config,
  );
}

export function moveFirstLoginGuide(state, step) {
  if (!state?.active || !step) {
    return state;
  }
  return {
    ...state,
    step,
  };
}

function enterFirstLoginCoreStep(state, step) {
  const placement = PLACEMENT_BY_CORE_STEP[step];
  const completed = new Set(state?.completedTipIds ?? []);
  const tip = placement
    ? state?.config?.tips?.find((item) => item.placement === placement && !completed.has(item.id))
    : null;
  return tip ? { ...state, step: "tip", tipId: tip.id, nextStep: step } : moveFirstLoginGuide(state, step);
}

export function resolveFirstLoginGuideTargetKey(state) {
  if (state?.step === "tip") {
    return state.config?.tips?.find((item) => item.id === state.tipId)?.targetKey ?? "";
  }
  return CORE_TARGET_BY_STEP[state?.step] ?? "";
}

export function advanceFirstLoginTipForTargetAction(state, action, clickedTargetKey = null) {
  if (state?.step !== "tip") return state;
  const targetKey = resolveFirstLoginGuideTargetKey(state);
  if (TARGET_ACTION_BY_KEY[targetKey] !== action) return state;
  if (clickedTargetKey !== null && clickedTargetKey !== targetKey) return state;
  return reduceFirstLoginGuideAction(state, "next-first-login-tip").state;
}

export function reduceFirstLoginTipTargetAction(state, action, clickedTargetKey = null) {
  const nextState = advanceFirstLoginTipForTargetAction(state, action, clickedTargetKey);
  const handled = nextState !== state;
  return {
    handled,
    allowAction: !handled || nextState?.step !== "tip",
    state: nextState,
  };
}

export function skipUnavailableFirstLoginTips(state, availableTargetKeys) {
  const available = availableTargetKeys instanceof Set
    ? availableTargetKeys
    : new Set(Array.isArray(availableTargetKeys) ? availableTargetKeys : []);
  let nextState = state;
  for (let skipped = 0; skipped < 12 && nextState?.step === "tip"; skipped += 1) {
    const targetKey = resolveFirstLoginGuideTargetKey(nextState);
    if (targetKey && available.has(targetKey)) break;
    const advanced = reduceFirstLoginGuideAction(nextState, "next-first-login-tip").state;
    if (advanced === nextState) break;
    nextState = advanced;
  }
  return nextState;
}

export function advanceFirstLoginGuide(state, event) {
  const transitions = {
    "project-created": ["create-project", "enter-project"],
    "project-opened": ["enter-project", "prepare-script"],
    "episode-flow-opened": ["prepare-script", "generate-storyboard"],
    "generation-started": ["generate-storyboard", "generating"],
    "generation-ready": ["generating", "confirm-storyboard"],
    "generation-failed": ["generating", "generate-storyboard"],
    "preview-closed": ["confirm-storyboard", "generate-storyboard"],
    "storyboard-committed": ["confirm-storyboard", "complete"],
  };
  if (event === "editor-closed") {
    if (state?.step === "tip" && state.nextStep === "generate-storyboard") {
      return moveFirstLoginGuide(state, "prepare-script");
    }
    return ["generate-storyboard", "generating", "confirm-storyboard"].includes(state?.step)
      ? moveFirstLoginGuide(state, "prepare-script")
      : state;
  }
  if (event === "preview-closed" && state?.step === "tip" && state.nextStep === "confirm-storyboard") {
    return moveFirstLoginGuide(state, "generate-storyboard");
  }
  const [expectedStep, nextStep] = transitions[event] ?? [];
  return state?.step === expectedStep
    ? enterFirstLoginCoreStep(state, nextStep)
    : state;
}

export function reduceFirstLoginGuideAction(state, action) {
  if (!state?.active) {
    return { handled: false, state };
  }
  if (action === "dismiss-first-login-guide") {
    return { handled: true, state: null };
  }
  if (action === "start-first-login-guide" && state.step === "welcome") {
    return {
      handled: true,
      state: enterFirstLoginCoreStep(state, "create-project"),
    };
  }
  if (action === "next-first-login-tip" && state.step === "tip") {
    return {
      handled: true,
      state: enterFirstLoginCoreStep({
        ...state,
        completedTipIds: [...new Set([...(state.completedTipIds ?? []), state.tipId])],
      }, state.nextStep),
    };
  }
  if (
    state.step === "prepare-script" &&
    ["first-login-use-sample-script", "first-login-use-own-script"].includes(action)
  ) {
    return {
      handled: true,
      state: enterFirstLoginCoreStep(state, "generate-storyboard"),
      openSingleEpisode: true,
      script: action === "first-login-use-sample-script"
        ? FIRST_LOGIN_ONBOARDING_SAMPLE_SCRIPT
        : "",
    };
  }
  return { handled: false, state };
}

export function renderFirstLoginGuide(state) {
  if (!state?.active) {
    return "";
  }

  if (state.step === "welcome") {
    const content = state.config?.welcome ?? DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.welcome;
    return `
      <div class="first-login-guide-backdrop" data-first-login-guide>
        <section class="first-login-guide-card first-login-guide-card--welcome" role="dialog" aria-modal="true" aria-labelledby="first-login-guide-title">
          <button class="first-login-guide-dismiss" type="button" data-action="dismiss-first-login-guide" aria-label="退出新手引导">×</button>
          <div class="first-login-guide-icon" aria-hidden="true">✦</div>
          <p class="first-login-guide-eyebrow">${escapeGuideHtml(content.eyebrow)}</p>
          <h2 id="first-login-guide-title">${escapeGuideHtml(content.title)}</h2>
          <p class="first-login-guide-description">${escapeGuideHtml(content.description)}</p>
          <div class="first-login-guide-actions">
            <button class="first-login-guide-primary" type="button" data-action="start-first-login-guide">${escapeGuideHtml(content.primaryButton)}</button>
            <button class="first-login-guide-secondary" type="button" data-action="dismiss-first-login-guide">${escapeGuideHtml(content.secondaryButton)}</button>
          </div>
        </section>
      </div>
    `;
  }

  if (state.step === "complete") {
    const content = state.config?.complete ?? DEFAULT_FIRST_LOGIN_ONBOARDING_CONFIG.complete;
    return `
      <aside class="first-login-guide-card first-login-guide-card--compact first-login-guide-card--complete" data-first-login-guide aria-live="polite">
        <div class="first-login-guide-icon" aria-hidden="true">✓</div>
        <p class="first-login-guide-eyebrow">${escapeGuideHtml(content.eyebrow)}</p>
        <h2>${escapeGuideHtml(content.title)}</h2>
        <p class="first-login-guide-description">${escapeGuideHtml(content.description)}</p>
        <button class="first-login-guide-primary" type="button" data-action="dismiss-first-login-guide">${escapeGuideHtml(content.primaryButton)}</button>
      </aside>
    `;
  }

  if (state.step === "tip") {
    const tip = state.config?.tips?.find((item) => item.id === state.tipId);
    if (!tip) return "";
    return `
      <aside class="first-login-guide-card first-login-guide-card--compact" data-first-login-guide data-first-login-tip-id="${escapeGuideHtml(tip.id)}" aria-live="polite">
        <div class="first-login-guide-heading"><div><p class="first-login-guide-eyebrow">${escapeGuideHtml(tip.eyebrow)}</p><span class="first-login-guide-progress">提示</span></div><button class="first-login-guide-dismiss" type="button" data-action="dismiss-first-login-guide" aria-label="退出新手引导">×</button></div>
        <h2>${escapeGuideHtml(tip.title)}</h2>
        <p class="first-login-guide-description">${escapeGuideHtml(tip.description)}</p>
        <button class="first-login-guide-primary" type="button" data-action="next-first-login-tip">${escapeGuideHtml(tip.primaryButton)}</button>
      </aside>
    `;
  }

  const configKey = CORE_STEP_CONFIG_KEYS[state.step];
  const content = configKey ? state.config?.steps?.[configKey] : null;
  if (!content) {
    return "";
  }
  const scriptActions = state.step === "prepare-script"
    ? `
      <div class="first-login-guide-actions first-login-guide-actions--stacked">
        <button class="first-login-guide-primary" type="button" data-action="first-login-use-sample-script">${escapeGuideHtml(state.config.prepareScriptButtons.sample)}</button>
        <button class="first-login-guide-secondary" type="button" data-action="first-login-use-own-script">${escapeGuideHtml(state.config.prepareScriptButtons.own)}</button>
      </div>
    `
    : "";
  return `
    <aside class="first-login-guide-card first-login-guide-card--compact" data-first-login-guide aria-live="polite">
      <div class="first-login-guide-heading">
        <div>
          <p class="first-login-guide-eyebrow">${escapeGuideHtml(content.eyebrow)}</p>
          <span class="first-login-guide-progress">${CORE_STEP_PROGRESS[state.step]}</span>
        </div>
        <button class="first-login-guide-dismiss" type="button" data-action="dismiss-first-login-guide" aria-label="退出新手引导">×</button>
      </div>
      <h2>${escapeGuideHtml(content.title)}</h2>
      <p class="first-login-guide-description">${escapeGuideHtml(content.description)}</p>
      ${scriptActions}
    </aside>
  `;
}
