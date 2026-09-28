// Shared by browser counters and server intake. No model names or provider defaults.
export function composeGenerationPrompt(prompt, context = {}) {
  if (Array.isArray(context.stages)) return context.stages.reduce((text, stage) => composeGenerationPrompt(text, stage), String(prompt ?? ""));
  const original = String(prompt ?? "");
  const prefixes = (context.prefixes ?? []).map((part) => String(part ?? "").trim())
    .filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index)
    .filter((part) => !original.startsWith(part));
  let text = [...prefixes, original].filter(Boolean).join("\n");
  const style = String(context.style ?? "").trim();
  if (!style) return text;
  if (context.mediaType === "video") {
    const formatted = `视频风格：${style}`;
    if (text === formatted || text.endsWith(`\n${formatted}`)) return text;
    return [...text.split(/\r?\n/u).filter((line) => !/^\s*视频风格：/u.test(line) && line.trim() !== style),
      formatted].filter(Boolean).join("\n");
  }
  if (context.mediaType === "image") {
    const reference = context.styleReferenceName ? `参考【@${context.styleReferenceName}】不要出现参考图内容，` : "";
    const formatted = `图片风格：${reference}${style}${/[。！？.!?]$/u.test(style) ? "" : "。"}`;
    if (text === formatted || text.endsWith(`\n${formatted}`)) return text;
    const lines = text.split(/\r?\n/u);
    const index = lines.findIndex((line) => /^\s*图片风格：/u.test(line) && line.includes(style));
    if (index >= 0) { lines[index] = formatted; return lines.join("\n"); }
    return [text, formatted].filter(Boolean).join("\n");
  }
  return text;
}

export function resolveGenerationPromptLimit(model) {
  const schema = model?.parameterSchema?.prompt ?? {};
  const limits = model?.limits ?? {};
  const schemaMaximum = Number(schema.maxLength);
  const schemaWins = Number.isFinite(schemaMaximum) && schemaMaximum > 0;
  const maximum = schemaWins ? schemaMaximum : Number(limits.maxPromptLength);
  if (!Number.isFinite(maximum) || maximum <= 0) return null;
  const unit = String((schemaWins ? schema.limitUnit : undefined) ?? limits.promptLengthUnit ?? "characters").toLowerCase();
  return { maximum: Math.floor(maximum), unit };
}

export function measureGenerationPrompt(prompt, limit) {
  const text = String(prompt ?? "");
  if (limit?.unit === "characters") return [...text].length;
  if (limit?.unit === "bytes") return new TextEncoder().encode(text).length;
  // A token budget requires the target model's tokenizer. Character counts and
  // generic token estimates must never become a hard rejection or truncation.
  return null;
}

export function generationPromptExceedsLimit(prompt, limit) {
  const length = measureGenerationPrompt(prompt, limit);
  return limit !== null && length !== null && length > limit.maximum;
}

export function formatGenerationPromptCount(prompt, model) {
  const source = String(prompt ?? "");
  prompt = composeGenerationPrompt(source, model?.promptComposition);
  const characters = [...String(prompt ?? "")].length;
  const limit = resolveGenerationPromptLimit(model);
  if (!limit) return `${characters} 字符`;
  const length = model?.promptBudget && measureGenerationPrompt(source, limit) !== null
    ? measureGenerationPrompt(source, limit) + model.promptBudget.additionalLength : measureGenerationPrompt(prompt, limit);
  if (length === null) return `${characters} 字符 · 模型上限 ${limit.maximum} ${limit.unit}（由模型校验）`;
  const label = limit.unit === "bytes" ? "字节" : "字符";
  const overflow = model?.mediaType === "audio" ? " · 朗读原文保留，请分段后生成" : " · 请手动缩短提示词";
  const additional = length - measureGenerationPrompt(source, limit);
  return `${length} / ${limit.maximum} ${label}${additional > 0 ? `（含系统附加 ${additional} ${label}）` : ""}${length > limit.maximum ? overflow : ""}`;
}
