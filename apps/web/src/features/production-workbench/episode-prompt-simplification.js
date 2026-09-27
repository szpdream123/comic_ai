import { composeGenerationPrompt, formatGenerationPromptCount, generationPromptExceedsLimit, measureGenerationPrompt, resolveGenerationPromptLimit } from "../../shared/generation-prompt-policy.js";

export function canSimplifyPrompt({ prompt, model, mediaMode }) {
  const limit = resolveGenerationPromptLimit(model);
  const length = measureGenerationPrompt(prompt, limit);
  return mediaMode !== "lip-sync" && ["image", "video"].includes(model?.mediaType)
    && (model?.promptBudget && length !== null ? length + model.promptBudget.additionalLength > limit.maximum
      : generationPromptExceedsLimit(composeGenerationPrompt(prompt, model?.promptComposition), limit));
}

// Requests and previews never write drafts. Acceptance is the sole write boundary.
export function createPromptSimplificationController({ getSnapshot, request, preview, apply, getOriginal, saveOriginal, notify, changed }) {
  let pending = false;
  let observed = "";
  let revision = 0;
  let retry = null;
  const observedDrafts = new Map();
  const fingerprint = (snapshot) => JSON.stringify(snapshot);
  function observe() {
    const snapshot = getSnapshot();
    if (observedDrafts.has(snapshot.scope) && observedDrafts.get(snapshot.scope) !== snapshot.prompt
      && !String(snapshot.prompt ?? "").trim()
      && typeof getOriginal(snapshot.scope) === "string") {
      saveOriginal(snapshot.scope, undefined);
    }
    observedDrafts.set(snapshot.scope, snapshot.prompt);
    const next = fingerprint(snapshot);
    if (next !== observed) { observed = next; revision += 1; }
    return revision;
  }
  return {
    observe,
    get pending() { return pending; },
    async start() {
      const snapshot = getSnapshot();
      if (pending || !canSimplifyPrompt(snapshot)) return;
      const version = observe();
      const signature = fingerprint(snapshot);
      const current = () => observe() === version && fingerprint(getSnapshot()) === signature;
      if (retry?.signature !== signature) {
        retry = { signature, key: globalThis.crypto?.randomUUID?.() ?? `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      }
      pending = true;
      changed();
      notify("正在精简提示词，原稿保留…");
      try {
        const response = await request(snapshot.episodeId, {
          ...snapshot.generationSelection,
          ...(snapshot.promptStyle ? { promptStyle: snapshot.promptStyle } : {}),
          model: snapshot.model.modelCode, prompt: snapshot.prompt,
          ...(snapshot.parameters ? { parameters: snapshot.parameters } : {}),
          ...(snapshot.firstFrameUrl ? { firstFrameUrl: snapshot.firstFrameUrl } : {}),
        }, { idempotencyKey: retry.key });
        if (!current()) return;
        const result = response?.data ?? response;
        if (typeof result?.prompt !== "string" || !result.prompt.trim()) throw new Error("精简结果为空，请重试");
        notify("");
        const accepted = await preview({ original: snapshot.prompt, prompt: result.prompt, model: snapshot.model,
          adaptedModel: result.promptBudget ? { ...snapshot.model, promptBudget: result.promptBudget } : snapshot.model });
        if (!current() || !accepted) return;
        if (typeof getOriginal(snapshot.scope) !== "string") saveOriginal(snapshot.scope, snapshot.prompt);
        // Applying another accepted suggestion continues the same draft lineage.
        observedDrafts.set(snapshot.scope, result.prompt);
        apply(result.prompt, result.promptBudget);
        retry = null;
        notify("已采用精简稿，可继续手动修改或恢复原稿。");
      } catch (error) {
        // A terminal validation/rewrite failure is cached by the server. Only a
        // fresh user click may start a new attempt; ambiguous transport failures
        // and pending 409 responses keep their original key.
        if (Number(error?.status) === 400) retry = null;
        if (current()) notify(`精简失败，原稿已保留：${error?.message ?? "请稍后重试"}`);
      } finally {
        pending = false;
        changed();
      }
    },
    restore() {
      observe();
      const snapshot = getSnapshot();
      const original = getOriginal(snapshot.scope);
      if (pending || typeof original !== "string") return false;
      observedDrafts.set(snapshot.scope, original);
      apply(original);
      saveOriginal(snapshot.scope, undefined);
      notify("已恢复原稿。");
      changed();
      return true;
    },
  };
}

export function previewSimplifiedPrompt({ original, prompt, model, adaptedModel = model }, document = globalThis.document) {
  return new Promise((resolve) => {
    const trigger = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "episode-prompt-simplification-dialog";
    dialog.setAttribute("aria-labelledby", "prompt-simplification-title");
    const title = document.createElement("h2");
    title.id = "prompt-simplification-title";
    title.textContent = "AI 精简提示词";
    const description = document.createElement("p");
    description.textContent = "请对照检查人物、动作与镜头要求。采用后仍可修改或恢复原稿，不会开始生成。";
    dialog.append(title, description);
    const comparison = document.createElement("div");
    comparison.className = "episode-prompt-simplification-comparison";
    for (const [label, value] of [["原稿", original], ["精简稿", prompt]]) {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = `${label} · ${formatGenerationPromptCount(value, label === "精简稿" ? adaptedModel : model)}`;
      const content = document.createElement("pre");
      content.textContent = value;
      section.append(heading, content);
      comparison.append(section);
    }
    dialog.append(comparison);
    const actions = document.createElement("div");
    actions.className = "episode-prompt-simplification-actions";
    for (const [label, accepted] of [["保留原稿", false], ["采用精简稿", true]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "episode-replica-mini";
      button.textContent = label;
      button.addEventListener("click", () => dialog.close(accepted ? "accept" : "cancel"));
      actions.append(button);
    }
    dialog.append(actions);
    dialog.addEventListener("close", () => {
      const accepted = dialog.returnValue === "accept";
      dialog.remove();
      if (trigger?.isConnected) trigger.focus();
      resolve(accepted);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    actions.querySelector("button").focus();
  });
}

export async function withPromptSimplificationLoading(request, document = globalThis.document) {
  const trigger = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "episode-prompt-simplification-dialog episode-prompt-simplification-loading";
  dialog.setAttribute("aria-labelledby", "prompt-simplification-loading-title");
  dialog.setAttribute("aria-busy", "true");
  const spinner = document.createElement("span");
  spinner.className = "episode-prompt-simplification-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const title = document.createElement("h2");
  title.id = "prompt-simplification-loading-title";
  title.textContent = "正在精简提示词";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "正在生成精简稿并核验内容，请稍候…";
  const note = document.createElement("p");
  note.className = "episode-prompt-simplification-loading-note";
  note.textContent = "原稿已保留，完成后可对比并选择是否采用。";
  dialog.append(spinner, title, status, note);
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(dialog);
  try {
    dialog.showModal();
    return await request();
  } finally {
    if (dialog.open) dialog.close();
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
  }
}
