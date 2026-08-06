export const toolboxPromptReverseConfigKey = "creator.toolbox_prompt_reverse";

export interface ToolboxPromptReverseConfig {
  imageInstruction: string;
  videoInstruction: string;
}

export const defaultToolboxPromptReverseConfig: ToolboxPromptReverseConfig = {
  imageInstruction: `帮我拆解这张图片，重点分析主体、场景、风格、色调构图和细节，尽量细化到位，不要只做浅层描述。
根据刚刚的分析结果，帮我反向生成一套完整的 AI 生图提示词，最大程度还原原图的氛围、风格和画面质感。
再将这套提示词优化成适配 AI 直接生图的版本，做到表述清晰、细节完善，可以直接使用。

请严格只输出一个 JSON 对象，不要 Markdown 代码块或额外解释，字段必须是：
{"description":"中文画面描述","positivePrompt":"English prompt","tags":["tag"],"negativePrompt":"English negative prompt"}
positivePrompt 要可直接用于图像生成，tags 使用简短英文标签；看不出负面内容时 negativePrompt 输出空字符串。`,
  videoInstruction: `根据视频内容反推完整视频提示词，必须涵盖以下要素：
输入图片是本地视频解析插件按时间顺序生成的连续画面联系表，采样率不低于 6 FPS。必须严格按照联系表数组的先后顺序，并在每张联系表内按照从左到右、从上到下的顺序分析完整时间线；将相邻画面的变化还原为连续动作、镜头运动和分镜切换，不得把联系表误判为拼贴画或只描述单个静态画面。
按每 {{segmentDurationSeconds}} 秒一个分镜窗口切分视频（最后一段可不足该时长）。现有 positivePrompt 字段必须继续输出完整视频提示词，保持原有整段视频提示词语义不变。新增 segments 仅用于补充资产分析：在每个时间段列出该段首次出现或发生明显变化的人物、道具、场景资产，并为资产单独生成可复用的提示词；已经在前段定义且没有变化的资产不要重复生成，只引用其名称或 ID。后一分镜必须引用前一分镜的结尾状态，明确人物位置/姿态、道具状态、场景与光线的延续或变化，给出可执行的衔接动作。
主体（人物/物品/场景）：详细描述核心对象特征。动作：精确说明动态表现，详细动作分解，包括身体细微动作、头部细微动作、手部细微动作、脸部细微动作、腿部细微动作、眼神细微动作、嘴巴细微动作、身材细节与衣服飘动动作细节，要求最大程度还原。
场景：环境、氛围、时间设定。
光影：光线类型、强度、方向。
运镜：推、拉、摇、移、俯拍、仰拍等镜头运动。
语言风格：视觉风格、色调等。
画质：分辨率、帧率、特效参数。着重描写人物的妆造、发型、神态、服饰；完整视频提示词最后统一加上“画面内容无字幕，人物无纹身”。

请严格只输出一个 JSON 对象，不要 Markdown 代码块或额外解释，字段必须是：
{"description":"中文视频内容分析","positivePrompt":"完整视频提示词（保持原有语义）","tags":["tag"],"negativePrompt":"中文负向提示词","segments":[{"index":1,"startMs":0,"endMs":{{segmentDurationMs}},"description":"该时间段分析","characters":[{"name":"人物名称","prompt":"首次出现的人物资产提示词"}],"props":[{"name":"道具名称","prompt":"首次出现的道具资产提示词"}],"scenes":[{"name":"场景名称","prompt":"首次出现的场景资产提示词"}],"continuity":"与上一分镜衔接说明"}]}
positivePrompt 要可直接用于 AI 视频生成，tags 使用简短英文标签；看不出负面内容时 negativePrompt 输出空字符串。`,
};

export function normalizeToolboxPromptReverseConfig(value: unknown): ToolboxPromptReverseConfig {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    imageInstruction: nonEmptyBoundedString(record.imageInstruction, defaultToolboxPromptReverseConfig.imageInstruction),
    videoInstruction: nonEmptyBoundedString(record.videoInstruction, defaultToolboxPromptReverseConfig.videoInstruction),
  };
}

export function renderToolboxPromptReverseInstruction(
  value: unknown,
  mode: "image" | "video",
  segmentDurationMs = 15_000,
) {
  const config = normalizeToolboxPromptReverseConfig(value);
  if (mode === "image") return config.imageInstruction;
  const durationMs = Math.max(1_000, Math.round(Number(segmentDurationMs) || 15_000));
  return config.videoInstruction
    .replaceAll("{{segmentDurationSeconds}}", String(Math.max(1, Math.round(durationMs / 1_000))))
    .replaceAll("{{segmentDurationMs}}", String(durationMs));
}

function nonEmptyBoundedString(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized.length <= 60_000 ? normalized : fallback;
}
