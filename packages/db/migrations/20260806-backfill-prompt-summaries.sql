UPDATE prompts
SET summary = CASE
  WHEN prompt_category = 'script' AND name LIKE '%负向约束%' THEN
    '汇总画面生成中的负向限制，减少文字水印、结构畸变、主体缺失与低质量画面。'
  WHEN prompt_category = 'script' AND name LIKE '%一致性禁忌%' THEN
    '约束角色身份、外貌、服装与关系连续性，避免跨场景设定漂移。'
  WHEN prompt_category = 'script' AND name LIKE '%质量禁忌%' THEN
    '统一过滤剧情和画面中的常见质量问题，提升后续分镜与生成结果的稳定性。'
  WHEN prompt_category = 'script' AND name = '通用小说转剧本' THEN
    '将小说原文重组为节奏清晰、冲突明确、可继续拆解分镜的短剧剧本。'
  WHEN prompt_category = 'script' AND name = '反转剧本' THEN
    '强化开篇钩子、信息误导与层层反转，生成具有悬念和爆点的短剧剧本。'
  WHEN prompt_category = 'script' THEN
    concat('围绕「', name, '」题材设计冲突、情绪钩子与剧情节奏，辅助将小说改编为短剧剧本。')
  WHEN prompt_category = 'shot' AND name LIKE '%markdown%' THEN
    '将剧情整理为结构清晰的 Markdown 分镜，明确镜头顺序、画面重点与台词信息。'
  WHEN prompt_category = 'shot' THEN
    concat('按照「', name, '」规则拆解剧情，明确景别、机位、运镜、时长与视听节奏。')
  WHEN prompt_category = 'storyboard' THEN
    concat('用于「', name, '」故事板生成，组织连续画面、角色动作、台词与场景衔接。')
  WHEN prompt_category = 'scene_extract' AND name LIKE '%长篇%' THEN
    '面向长篇小说拆分完整场景，提取地点、时间、空间关系、氛围与连续性线索。'
  WHEN prompt_category = 'scene_extract' THEN
    concat('按照「', name, '」规则抽取场景，整理环境、时间、空间关系与视觉细节。')
  WHEN prompt_category = 'character_extract' THEN
    concat('用于「', name, '」人物设定，整理身份、外貌、服装、关系与多视角一致性信息。')
  WHEN prompt_category = 'prop_extract' THEN
    concat('按照「', name, '」规则识别关键道具，整理外观、材质、用途及连续性要求。')
  WHEN prompt_category = 'image_style' THEN
    concat('将画面转换为「', name, '」视觉风格，统一构图、色彩、光影、材质与细节表现。')
  ELSE concat('围绕「', name, '」提供可复用的提示词能力，适用于对应创作流程。')
END,
updated_at = NOW()
WHERE is_official = true
  AND deleted_at IS NULL
  AND (
    summary = ''
    OR summary LIKE '官方发布的%'
    OR summary = '豆包生图风格预设'
  );
